import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { apiUrl } from '../../shared/config/api.config';
import { filterVisibleForCurrentUser } from '../../shared/catalog-visibility';
import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, getCurrentUserRoleId, isAdminUser } from '../../shared/user-profile';

type EstadoSubcategoria = 'activo' | 'inactivo';

interface Subcategoria {
  id_subcategoria: number;
  id_categoria: number;
  nombre_subcategoria: string;
  descripcion: string | null;
  estado: boolean;
  fecha_creacion: string;
  id_usuario?: number | null;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface SubcategoriaPayload {
  id_categoria: number;
  nombre_subcategoria: string;
  descripcion?: string;
  estado: boolean;
}

interface CategoriaOption {
  id_categoria: number;
  nombre_categoria: string;
  id_usuario: number;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
}

interface SubcategoriaGroup {
  id_categoria: number;
  nombre_categoria: string;
  total: number;
  subcategorias: Subcategoria[];
}

@Component({
  selector: 'app-subcategorias-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    NgIf,
    NgFor,
    NgClass,
    DatePipe,
    MaintenanceActionsComponent,
    SessionStripComponent,
  ],
  templateUrl: './subcategorias.page.html',
  styleUrl: './subcategorias.page.css',
})
export class SubcategoriasPage implements OnInit {
  readonly pageSize = 10;

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('subcategorias');
  private readonly categoriasUrl = apiUrl('categorias');
  private readonly currentUserId = getCurrentUserId();
  private readonly currentUserRoleId = getCurrentUserRoleId();
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  subcategorias: Subcategoria[] = [];
  categorias: CategoriaOption[] = [];
  expandedCategoriaIds = new Set<number>();
  currentPage = 1;
  transactionsOpen = false;
  maintenanceOpen = false;
  loading = false;
  saving = false;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  readonly today = new Date();

  readonly subcategoriaForm = this.fb.group({
    id_categoria: ['', [Validators.required]],
    nombre_subcategoria: ['', [Validators.required, Validators.maxLength(50)]],
    descripcion: ['', [Validators.maxLength(100)]],
    estado: ['activo' as EstadoSubcategoria, [Validators.required]],
  });

  constructor() {
    void this.loadCategorias();
  }

  ngOnInit(): void {
    void this.loadSubcategorias();
  }

  toggleMaintenanceMenu(): void {
    this.maintenanceOpen = !this.maintenanceOpen;
  }

  toggleTransactionsMenu(): void {
    this.transactionsOpen = !this.transactionsOpen;
  }

  get isEditing(): boolean {
    return this.editingId !== null;
  }

  get isRole2Session(): boolean {
    return this.currentUserRoleId === 2;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.subcategorias.length / this.pageSize));
  }

  get paginatedSubcategorias(): Subcategoria[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.subcategorias.slice(startIndex, startIndex + this.pageSize);
  }

  get subcategoriaGroups(): SubcategoriaGroup[] {
    const categoriasMap = new Map(
      this.categorias.map((categoria) => [categoria.id_categoria, categoria.nombre_categoria]),
    );
    const groupsMap = new Map<number, SubcategoriaGroup>();

    for (const subcategoria of this.subcategorias) {
      const group = groupsMap.get(subcategoria.id_categoria);

      if (group) {
        group.subcategorias.push(subcategoria);
        group.total += 1;
        continue;
      }

      groupsMap.set(subcategoria.id_categoria, {
        id_categoria: subcategoria.id_categoria,
        nombre_categoria:
          categoriasMap.get(subcategoria.id_categoria) ??
          `Categoria ${subcategoria.id_categoria}`,
        total: 1,
        subcategorias: [subcategoria],
      });
    }

    return Array.from(groupsMap.values())
      .map((group) => ({
        ...group,
        subcategorias: [...group.subcategorias].sort((a, b) =>
          a.nombre_subcategoria.localeCompare(b.nombre_subcategoria),
        ),
      }))
      .sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadSubcategorias(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const subcategorias = await firstValueFrom(
        this.http
          .get<Subcategoria[]>(this.apiUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      this.subcategorias = filterVisibleForCurrentUser(subcategorias, this.currentUserId);
      this.expandedCategoriaIds.clear();
      this.currentPage = 1;
    } catch {
      this.subcategorias = [];
      this.expandedCategoriaIds.clear();
      this.currentPage = 1;
      this.errorMessage =
        'No se pudieron cargar las subcategorias. Revisa si el backend esta encendido y responde en localhost:3001.';
      await this.alerts.error('Error al cargar', this.errorMessage);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  toggleCategoriaGroup(idCategoria: number): void {
    if (this.expandedCategoriaIds.has(idCategoria)) {
      this.expandedCategoriaIds.delete(idCategoria);
      return;
    }

    this.expandedCategoriaIds.add(idCategoria);
  }

  isCategoriaGroupExpanded(idCategoria: number): boolean {
    return this.expandedCategoriaIds.has(idCategoria);
  }

  async loadCategorias(): Promise<void> {
    try {
      const categorias = await firstValueFrom(
        this.http
          .get<CategoriaOption[]>(this.categoriasUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      this.categorias = filterVisibleForCurrentUser(categorias, this.currentUserId);
    } catch {
      this.categorias = [];
    }
  }

  editSubcategoria(subcategoria: Subcategoria): void {
    if (!this.canManageSubcategoria(subcategoria)) {
      this.errorMessage = 'No tienes permisos para editar esta subcategoria.';
      void this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    this.editingId = subcategoria.id_subcategoria;
    this.successMessage = '';
    this.errorMessage = '';
    this.subcategoriaForm.reset({
      id_categoria: String(subcategoria.id_categoria),
      nombre_subcategoria: subcategoria.nombre_subcategoria,
      descripcion: subcategoria.descripcion ?? '',
      estado: subcategoria.estado ? 'activo' : 'inactivo',
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.subcategoriaForm.reset({
      id_categoria: '',
      nombre_subcategoria: '',
      descripcion: '',
      estado: 'activo',
    });
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.subcategoriaForm.invalid) {
      this.subcategoriaForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;

    const categoriaSeleccionada = this.categorias.find(
      (categoria) => String(categoria.id_categoria) === this.subcategoriaForm.value.id_categoria,
    );

    if (!categoriaSeleccionada) {
      this.errorMessage = 'Debes seleccionar una categoria valida.';
      this.saving = false;
      await this.alerts.warning('Categoria requerida', this.errorMessage);
      return;
    }

    const payload: SubcategoriaPayload = {
      id_categoria: categoriaSeleccionada.id_categoria,
      nombre_subcategoria: this.subcategoriaForm.value.nombre_subcategoria?.trim() ?? '',
      descripcion: this.subcategoriaForm.value.descripcion?.trim() || undefined,
      estado: this.subcategoriaForm.value.estado === 'activo',
    };

    const wasEditing = this.isEditing;
    const currentId = this.editingId;

    try {
      if (wasEditing && currentId !== null) {
        await firstValueFrom(
          this.http.patch<Subcategoria>(`${this.apiUrl}/${currentId}`, payload, {
            params: { id_usuario: this.currentUserId },
          }),
        );
        this.successMessage = 'Subcategoria actualizada correctamente.';
        await this.alerts.success('Subcategoria actualizada', this.successMessage);
      } else {
        await firstValueFrom(
          this.http.post<Subcategoria>(this.apiUrl, payload, {
            params: { id_usuario: this.currentUserId },
          }),
        );
        this.successMessage = 'Subcategoria guardada correctamente.';
        await this.alerts.success('Subcategoria guardada', this.successMessage);
      }

      this.resetForm();
      await this.loadSubcategorias();
    } catch {
      this.errorMessage = 'No se pudo guardar la subcategoria.';
      await this.alerts.error('No se pudo guardar', this.errorMessage);
    } finally {
      this.saving = false;
    }
  }

  async removeSubcategoria(subcategoria: Subcategoria): Promise<void> {
    if (!this.canDeleteSubcategoria(subcategoria)) {
      this.errorMessage = 'No tienes permisos para eliminar esta subcategoria.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'la subcategoria',
      subcategoria.nombre_subcategoria,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = subcategoria.id_subcategoria;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${subcategoria.id_subcategoria}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      this.subcategorias = this.subcategorias.filter(
        (item) => item.id_subcategoria !== subcategoria.id_subcategoria,
      );
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === subcategoria.id_subcategoria) {
        this.resetForm();
      }

      this.successMessage = 'Subcategoria eliminada correctamente.';
      await this.alerts.success('Subcategoria eliminada', this.successMessage);
    } catch {
      this.errorMessage = 'No se pudo eliminar la subcategoria.';
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
    } finally {
      this.deletingId = null;
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }

    this.currentPage = page;
  }

  goToPreviousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  canManageSubcategoria(subcategoria: Subcategoria): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (this.isRole2Session && subcategoria.es_predeterminada) {
      return false;
    }

    return subcategoria.puede_editar ?? subcategoria.id_usuario === this.currentUserId;
  }

  canDeleteSubcategoria(subcategoria: Subcategoria): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (this.isRole2Session) {
      return false;
    }

    return subcategoria.puede_eliminar ?? subcategoria.id_usuario === this.currentUserId;
  }

  async showSubcategoriaDetail(subcategoria: Subcategoria): Promise<void> {
    await this.alerts.detail(
      'Detalle de subcategoria',
      [
        { label: 'Nombre', value: subcategoria.nombre_subcategoria },
        { label: 'Categoria', value: this.getCategoriaNombre(subcategoria.id_categoria) },
        { label: 'Descripcion', value: subcategoria.descripcion },
        { label: 'Estado', value: subcategoria.estado ? 'Activo' : 'Inactivo' },
        {
          label: 'Origen',
          value: subcategoria.es_predeterminada ? 'Predeterminada' : 'Personalizada',
        },
        { label: 'Fecha creacion', value: subcategoria.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Subcategoria #${subcategoria.id_subcategoria}`,
      },
    );
  }

  private getCategoriaNombre(idCategoria: number): string {
    return (
      this.categorias.find((categoria) => categoria.id_categoria === idCategoria)?.nombre_categoria ??
      `Categoria ${idCategoria}`
    );
  }
}
