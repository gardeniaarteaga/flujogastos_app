import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';

import { MaintenanceActionsComponent } from '../../shared/maintenance-actions/maintenance-actions.component';
import { SessionStripComponent } from '../../shared/session-strip/session-strip.component';
import { apiUrl } from '../../shared/config/api.config';
import { filterVisibleForCurrentUser } from '../../shared/catalog-visibility';
import { SweetAlertService } from '../../shared/services/sweet-alert.service';
import { getCurrentUserId, getCurrentUserRoleId, isAdminUser } from '../../shared/user-profile';

type EstadoCategoria = 'activo' | 'inactivo';

interface Categoria {
  id_categoria: number;
  nombre_categoria: string;
  descripcion: string | null;
  estado: boolean;
  fecha_creacion: string;
  id_usuario: number;
  es_predeterminada?: boolean;
  puede_editar?: boolean;
  puede_eliminar?: boolean;
}

interface CategoriaPayload {
  nombre_categoria: string;
  descripcion?: string;
  estado: boolean;
}

interface SubcategoriaPayload {
  id_categoria: number;
  nombre_subcategoria: string;
  descripcion?: string;
  estado: boolean;
}

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

interface SubcategoriaDraft {
  id_subcategoria: number | null;
  nombre_subcategoria: string;
  descripcion?: string;
}

@Component({
  selector: 'app-categorias-page',
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
  templateUrl: './categorias.page.html',
  styleUrl: './categorias.page.css',
})
export class CategoriasPage implements OnInit {
  readonly defaultSubcategoriaItems = 5;
  readonly pageSize = 10;

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alerts = inject(SweetAlertService);
  private readonly apiUrl = apiUrl('categorias');
  private readonly subcategoriasUrl = apiUrl('subcategorias');
  private readonly currentUserId = getCurrentUserId();
  private readonly currentUserRoleId = getCurrentUserRoleId();
  private categoriaEditMode: 'full' | 'subcategorias' | null = null;
  private categoriaEnEdicion: Categoria | null = null;
  get isAdminSession(): boolean {
    return isAdminUser();
  }

  categorias: Categoria[] = [];
  catalogSubcategorias: Subcategoria[] = [];
  expandedCategoriaIds = new Set<number>();
  currentPage = 1;
  transactionsOpen = false;
  maintenanceOpen = false;
  loading = false;
  saving = false;
  loadingSubcategorias = false;
  subcategoriasSectionEnabled = false;
  removingSubcategoriaIndex: number | null = null;
  deletingId: number | null = null;
  editingId: number | null = null;
  errorMessage = '';
  successMessage = '';
  loadedSubcategorias: Subcategoria[] = [];
  subcategoriaFieldIds: Array<number | null> = [];
  readonly today = new Date();

  readonly categoriaForm = this.fb.group({
    nombre_categoria: this.fb.control('', [Validators.required, Validators.maxLength(50)]),
    descripcion: this.fb.control('', [Validators.maxLength(150)]),
    estado: this.fb.control('activo' as EstadoCategoria, [Validators.required]),
    subcategorias: this.fb.array<FormControl<string | null>>([]),
  });

  constructor() {
    this.resetSubcategoriaFields();
  }

  ngOnInit(): void {
    void this.loadCategorias();
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

  get isSubcategoriaAppendMode(): boolean {
    return this.categoriaEditMode === 'subcategorias';
  }

  get shouldShowSubcategoriasSection(): boolean {
    return this.loadingSubcategorias || this.subcategoriasSectionEnabled;
  }

  get submitButtonLabel(): string {
    if (this.saving) {
      return 'Guardando...';
    }

    if (this.isSubcategoriaAppendMode) {
      return 'Guardar subcategorias';
    }

    return this.isEditing ? 'Actualizar categoria' : 'Guardar categoria';
  }

  get subcategoriasArray(): FormArray<FormControl<string | null>> {
    return this.categoriaForm.controls.subcategorias;
  }

  get subcategoriaControls(): FormControl<string | null>[] {
    return this.subcategoriasArray.controls;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.categorias.length / this.pageSize));
  }

  get paginatedCategorias(): Categoria[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.categorias.slice(startIndex, startIndex + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  async loadCategorias(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    try {
      const [categorias, subcategorias] = await Promise.all([
        firstValueFrom(
          this.http
            .get<Categoria[]>(this.apiUrl, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        ),
        firstValueFrom(
          this.http
            .get<Subcategoria[]>(this.subcategoriasUrl, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        ),
      ]);

      this.categorias = filterVisibleForCurrentUser(categorias, this.currentUserId);
      this.catalogSubcategorias = filterVisibleForCurrentUser(
        subcategorias,
        this.currentUserId,
      );
      this.expandedCategoriaIds.clear();
      this.currentPage = 1;
    } catch {
      this.categorias = [];
      this.catalogSubcategorias = [];
      this.expandedCategoriaIds.clear();
      this.currentPage = 1;
      this.errorMessage =
        'No se pudieron cargar las categorias. Revisa si el backend esta encendido, si responde en localhost:3001 y vuelve a intentar.';
      await this.alerts.error('Error al cargar', this.errorMessage);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async editCategoria(categoria: Categoria): Promise<void> {
    if (!this.canOpenCategoriaEditor(categoria)) {
      this.errorMessage = 'No tienes permisos para gestionar esta categoria.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const appendOnlyMode = !this.canManageCategoria(categoria) && this.canAppendSubcategoriasToCategoria(categoria);

    this.editingId = categoria.id_categoria;
    this.categoriaEnEdicion = categoria;
    this.successMessage = '';
    this.errorMessage = '';
    this.categoriaForm.controls.nombre_categoria.setValue(categoria.nombre_categoria);
    this.categoriaForm.controls.descripcion.setValue(categoria.descripcion ?? '');
    this.categoriaForm.controls.estado.setValue(categoria.estado ? 'activo' : 'inactivo');
    this.setCategoriaEditMode(appendOnlyMode ? 'subcategorias' : 'full');
    await this.loadSubcategoriasForCategoria(categoria.id_categoria);
    this.categoriaForm.markAsPristine();
    this.categoriaForm.markAsUntouched();
  }

  resetForm(): void {
    this.editingId = null;
    this.categoriaEnEdicion = null;
    this.categoriaForm.controls.nombre_categoria.reset('');
    this.categoriaForm.controls.descripcion.reset('');
    this.categoriaForm.controls.estado.reset('activo');
    this.loadedSubcategorias = [];
    this.subcategoriaFieldIds = [];
    this.subcategoriasSectionEnabled = false;
    this.setCategoriaEditMode(null);
    this.resetSubcategoriaFields();
    this.categoriaForm.markAsPristine();
    this.categoriaForm.markAsUntouched();
  }

  cancelEdit(): void {
    this.successMessage = '';
    this.errorMessage = '';
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.categoriaForm.invalid) {
      this.categoriaForm.markAllAsTouched();
      await this.alerts.warning(
        'Formulario incompleto',
        'Completa los campos obligatorios antes de continuar.',
      );
      return;
    }

    this.saving = true;
    const subcategoriasDraft = this.getSubcategoriasDraft();
    const appendOnlyMode = this.isSubcategoriaAppendMode;

    if (appendOnlyMode && subcategoriasDraft.length === 0) {
      this.saving = false;
      this.errorMessage = 'Agrega al menos una subcategoria nueva antes de guardar.';
      await this.alerts.warning('Sin cambios', this.errorMessage);
      return;
    }

    const payload: CategoriaPayload = {
      nombre_categoria: this.categoriaForm.value.nombre_categoria?.trim() ?? '',
      descripcion: this.categoriaForm.value.descripcion?.trim() || undefined,
      estado: this.categoriaForm.value.estado === 'activo',
    };

    const wasEditing = this.isEditing;
    const currentId = this.editingId;

    try {
      let savedCategoria: Categoria;

      if (wasEditing && currentId !== null) {
        if (appendOnlyMode) {
          const categoriaActual = this.categoriaEnEdicion ?? this.categorias.find(
            (categoria) => categoria.id_categoria === currentId,
          );

          if (!categoriaActual) {
            throw new Error('No se encontro la categoria en edicion.');
          }

          savedCategoria = categoriaActual;
        } else {
          savedCategoria = await firstValueFrom(
            this.http.patch<Categoria>(`${this.apiUrl}/${currentId}`, payload, {
              params: { id_usuario: this.currentUserId },
            }),
          );
        }

        if (!appendOnlyMode) {
          this.categorias = this.categorias
            .map((categoria) =>
              categoria.id_categoria === savedCategoria.id_categoria ? savedCategoria : categoria,
            )
            .sort((a, b) => a.id_categoria - b.id_categoria);
        }
      } else {
        savedCategoria = await firstValueFrom(
          this.http.post<Categoria>(this.apiUrl, payload, {
            params: { id_usuario: this.currentUserId },
          }),
        );
        this.categorias = [...this.categorias, savedCategoria].sort((a, b) => a.id_categoria - b.id_categoria);
      }

      const subcategoriasResult = await this.syncSubcategorias(savedCategoria, subcategoriasDraft);
      const baseMessage = appendOnlyMode
        ? 'Subcategorias guardadas correctamente.'
        : wasEditing
          ? 'Categoria actualizada correctamente.'
          : 'Categoria guardada correctamente.';

      if (subcategoriasResult.failed.length > 0) {
        this.editingId = savedCategoria.id_categoria;
        this.categoriaEnEdicion = savedCategoria;
        this.categoriaForm.controls.nombre_categoria.setValue(savedCategoria.nombre_categoria);
        this.categoriaForm.controls.descripcion.setValue(savedCategoria.descripcion ?? '');
        this.categoriaForm.controls.estado.setValue(savedCategoria.estado ? 'activo' : 'inactivo');
        this.setCategoriaEditMode(appendOnlyMode ? 'subcategorias' : 'full');
        this.subcategoriasSectionEnabled = true;
        this.resetSubcategoriaFields(
          [
            ...this.loadedSubcategorias.map((subcategoria) => subcategoria.nombre_subcategoria),
            ...subcategoriasResult.failed,
          ],
          [
            ...this.loadedSubcategorias.map((subcategoria) => subcategoria.id_subcategoria),
            ...Array.from({ length: subcategoriasResult.failed.length }, () => null),
          ],
        );
        this.syncLoadedSubcategoriaControlsState();
        this.successMessage =
          this.buildSubcategoriasSuccessMessage(baseMessage, subcategoriasResult);
        this.errorMessage =
          subcategoriasResult.failed.length === 1
            ? 'La categoria se guardo, pero no se pudo registrar 1 subcategoria. Corrigela y vuelve a intentar.'
            : `La categoria se guardo, pero no se pudieron registrar ${subcategoriasResult.failed.length} subcategorias. Corrigelas y vuelve a intentar.`;
        await this.alerts.warning('Guardado parcial', this.errorMessage);
      } else {
        this.successMessage = this.buildSubcategoriasSuccessMessage(
          baseMessage,
          subcategoriasResult,
        );
        this.resetForm();
        await this.alerts.success(
          wasEditing ? 'Categoria actualizada' : 'Categoria guardada',
          this.successMessage,
        );
      }

      await this.loadCategorias();
    } catch {
      this.errorMessage =
        'No se pudo guardar la categoria. Verifica la conexion con el backend y la estructura de la tabla.';
      await this.alerts.error('No se pudo guardar', this.errorMessage);
    } finally {
      this.saving = false;
    }
  }

  async removeCategoria(categoria: Categoria): Promise<void> {
    if (!this.canDeleteCategoria(categoria)) {
      this.errorMessage = 'No tienes permisos para eliminar esta categoria.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    const confirmed = await this.alerts.confirmDelete(
      'la categoria',
      categoria.nombre_categoria,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId = categoria.id_categoria;
    this.successMessage = '';
    this.errorMessage = '';

    try {
      await firstValueFrom(
        this.http
          .delete(`${this.apiUrl}/${categoria.id_categoria}`, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      this.categorias = this.categorias.filter((item) => item.id_categoria !== categoria.id_categoria);
      this.currentPage = Math.min(this.currentPage, this.totalPages);

      if (this.editingId === categoria.id_categoria) {
        this.resetForm();
      }

      this.successMessage = 'Categoria eliminada correctamente.';
      await this.alerts.success('Categoria eliminada', this.successMessage);
    } catch {
      this.errorMessage =
        'No se pudo eliminar la categoria. Si el boton queda cargando, revisa si el backend respondio al DELETE.';
      await this.alerts.error('No se pudo eliminar', this.errorMessage);
    } finally {
      this.deletingId = null;
    }
  }

  async showCategoriaDetail(categoria: Categoria): Promise<void> {
    const subcategoriasDetalle = this.getCategoriaSubcategoriasDetail(categoria.id_categoria);

    await this.alerts.detail(
      'Detalle de categoria',
      [
        { label: 'Nombre', value: categoria.nombre_categoria },
        { label: 'Descripcion', value: categoria.descripcion },
        { label: 'Estado', value: categoria.estado ? 'Activo' : 'Inactivo' },
        { label: 'Subcategorias asociadas', value: subcategoriasDetalle },
        {
          label: 'Origen',
          value: categoria.es_predeterminada ? 'Predeterminada' : 'Personalizada',
        },
        { label: 'Fecha creacion', value: categoria.fecha_creacion.slice(0, 10) },
      ],
      {
        subtitle: `Categoria #${categoria.id_categoria}`,
        width: '56rem',
      },
    );
  }

  onSubcategoriasToggle(event: Event): void {
    if (this.isSubcategoriaAppendMode) {
      this.subcategoriasSectionEnabled = true;
      return;
    }

    const enabled = (event.target as HTMLInputElement).checked;
    this.subcategoriasSectionEnabled = enabled;

    if (enabled && this.subcategoriasArray.length === 0) {
      this.resetSubcategoriaFields();
    }
  }

  addSubcategoriaField(): void {
    this.subcategoriasArray.push(this.createSubcategoriaControl());
    this.subcategoriaFieldIds.push(null);
    this.syncLoadedSubcategoriaControlsState();
  }

  async removeSubcategoriaField(index: number): Promise<void> {
    const subcategoriaId = this.subcategoriaFieldIds[index] ?? null;
    const subcategoria = this.loadedSubcategorias.find(
      (item) => item.id_subcategoria === subcategoriaId,
    );

    if (subcategoria && !this.canDeleteSubcategoria(subcategoria)) {
      this.errorMessage = 'No tienes permisos para eliminar esta subcategoria.';
      await this.alerts.warning('Accion no permitida', this.errorMessage);
      return;
    }

    if (subcategoriaId !== null) {
      const confirmed = await this.alerts.confirmDelete(
        'la subcategoria',
        subcategoria?.nombre_subcategoria ?? `#${subcategoriaId}`,
      );

      if (!confirmed) {
        return;
      }

      this.removingSubcategoriaIndex = index;

      try {
        await firstValueFrom(
          this.http
            .delete(`${this.subcategoriasUrl}/${subcategoriaId}`, {
              params: { id_usuario: this.currentUserId },
            })
            .pipe(timeout(10000)),
        );
        this.loadedSubcategorias = this.loadedSubcategorias.filter(
          (subcategoria) => subcategoria.id_subcategoria !== subcategoriaId,
        );
        this.catalogSubcategorias = this.catalogSubcategorias.filter(
          (item) => item.id_subcategoria !== subcategoriaId,
        );
        await this.alerts.success(
          'Subcategoria eliminada',
          'La subcategoria seleccionada fue eliminada correctamente.',
        );
      } catch {
        this.errorMessage = 'No se pudo eliminar la subcategoria seleccionada.';
        await this.alerts.error('No se pudo eliminar', this.errorMessage);
        return;
      } finally {
        this.removingSubcategoriaIndex = null;
      }
    }

    this.subcategoriasArray.removeAt(index);
    this.subcategoriaFieldIds.splice(index, 1);

    if (this.subcategoriasArray.length === 0 && this.subcategoriasSectionEnabled) {
      this.addSubcategoriaField();
    }
  }

  trackSubcategoriaField(index: number): number {
    return index;
  }

  canManageCategoria(categoria: Categoria): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (this.isRole2Session && categoria.es_predeterminada) {
      return false;
    }

    return categoria.puede_editar ?? categoria.id_usuario === this.currentUserId;
  }

  canDeleteCategoria(categoria: Categoria): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (this.isRole2Session && categoria.es_predeterminada) {
      return false;
    }

    return categoria.puede_eliminar ?? categoria.id_usuario === this.currentUserId;
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

  canManageSubcategoria(subcategoria: Subcategoria): boolean {
    if (this.isAdminSession) {
      return true;
    }

    if (this.isRole2Session && subcategoria.es_predeterminada) {
      return false;
    }

    return subcategoria.puede_editar ?? subcategoria.id_usuario === this.currentUserId;
  }

  canDeleteLoadedSubcategoriaAt(index: number): boolean {
    const subcategoriaId = this.subcategoriaFieldIds[index] ?? null;
    const subcategoria = this.loadedSubcategorias.find(
      (item) => item.id_subcategoria === subcategoriaId,
    );

    return !subcategoria || this.canDeleteSubcategoria(subcategoria);
  }

  canOpenCategoriaEditor(categoria: Categoria): boolean {
    return this.canManageCategoria(categoria) || this.canAppendSubcategoriasToCategoria(categoria);
  }

  canAppendSubcategoriasToCategoria(categoria: Categoria): boolean {
    return this.isRole2Session && Boolean(categoria.es_predeterminada);
  }

  getCategoriaEditTitle(categoria: Categoria): string {
    return this.canManageCategoria(categoria) ? 'Editar' : 'Agregar subcategorias';
  }

  toggleCategoriaAccordion(idCategoria: number): void {
    if (this.expandedCategoriaIds.has(idCategoria)) {
      this.expandedCategoriaIds.delete(idCategoria);
      return;
    }

    this.expandedCategoriaIds.add(idCategoria);
  }

  isCategoriaAccordionExpanded(idCategoria: number): boolean {
    return this.expandedCategoriaIds.has(idCategoria);
  }

  getCategoriaSubcategorias(idCategoria: number): Subcategoria[] {
    return this.catalogSubcategorias
      .filter((subcategoria) => subcategoria.id_categoria === idCategoria)
      .sort((a, b) => a.nombre_subcategoria.localeCompare(b.nombre_subcategoria));
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

  private createSubcategoriaControl(value = ''): FormControl<string | null> {
    return this.fb.control(value, [Validators.maxLength(50)]);
  }

  private resetSubcategoriaFields(values: string[] = [], ids: Array<number | null> = []): void {
    this.subcategoriasArray.clear();
    this.subcategoriaFieldIds = [];

    const totalItems = Math.max(this.defaultSubcategoriaItems, values.length);

    for (let index = 0; index < totalItems; index += 1) {
      this.subcategoriasArray.push(this.createSubcategoriaControl(values[index] ?? ''));
      this.subcategoriaFieldIds.push(ids[index] ?? null);
    }

    this.syncLoadedSubcategoriaControlsState();
  }

  private getSubcategoriasDraft(): SubcategoriaDraft[] {
    if (!this.subcategoriasSectionEnabled) {
      return [];
    }

    const seenNames = new Set<string>();

    return this.subcategoriaControls.flatMap((control, index) => {
      const nombreSubcategoria = control.value?.trim() ?? '';

      if (nombreSubcategoria.length === 0) {
        return [];
      }

      const normalizedName = nombreSubcategoria.toLocaleLowerCase();
      if (seenNames.has(normalizedName)) {
        return [];
      }

      seenNames.add(normalizedName);

      const idSubcategoria = this.subcategoriaFieldIds[index] ?? null;
      const loadedSubcategoria = this.loadedSubcategorias.find(
        (subcategoria) => subcategoria.id_subcategoria === idSubcategoria,
      );

      if (loadedSubcategoria && !this.canManageSubcategoria(loadedSubcategoria)) {
        return [];
      }

      return [
        {
          id_subcategoria: idSubcategoria,
          nombre_subcategoria: nombreSubcategoria,
          descripcion: loadedSubcategoria?.descripcion ?? undefined,
        },
      ];
    });
  }

  private async syncSubcategorias(
    categoria: Categoria,
    subcategoriasDraft: SubcategoriaDraft[],
  ): Promise<{ created: number; updated: number; failed: string[] }> {
    if (subcategoriasDraft.length === 0) {
      return { created: 0, updated: 0, failed: [] };
    }

    const requests = subcategoriasDraft.map(async (draft) => {
      const payload: SubcategoriaPayload = {
        id_categoria: categoria.id_categoria,
        nombre_subcategoria: draft.nombre_subcategoria,
        descripcion: draft.descripcion,
        estado: categoria.estado,
      };

      if (draft.id_subcategoria !== null) {
        const loadedSubcategoria = this.loadedSubcategorias.find(
          (subcategoria) => subcategoria.id_subcategoria === draft.id_subcategoria,
        );

        const currentName = loadedSubcategoria?.nombre_subcategoria.trim().toLocaleLowerCase();
        const nextName = draft.nombre_subcategoria.trim().toLocaleLowerCase();

        if (loadedSubcategoria && currentName === nextName) {
          return { action: 'skipped' as const, name: draft.nombre_subcategoria };
        }

        await firstValueFrom(
          this.http.patch(
            `${this.subcategoriasUrl}/${draft.id_subcategoria}`,
            payload,
            {
              params: { id_usuario: this.currentUserId },
            },
          ),
        );

        return { action: 'updated' as const, name: draft.nombre_subcategoria };
      }

      await firstValueFrom(
        this.http.post(this.subcategoriasUrl, payload, {
          params: { id_usuario: this.currentUserId },
        }),
      );

      return { action: 'created' as const, name: draft.nombre_subcategoria };
    });

    const results = await Promise.allSettled(requests);
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [subcategoriasDraft[index].nombre_subcategoria]
        : [],
    );

    return {
      created: results.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.action === 'created',
      ).length,
      updated: results.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.action === 'updated',
      ).length,
      failed,
    };
  }

  private buildSubcategoriasSuccessMessage(
    baseMessage: string,
    result: { created: number; updated: number },
  ): string {
    const summaryParts: string[] = [];

    if (result.created > 0) {
      summaryParts.push(
        result.created === 1
          ? 'Se agrego 1 subcategoria.'
          : `Se agregaron ${result.created} subcategorias.`,
      );
    }

    if (result.updated > 0) {
      summaryParts.push(
        result.updated === 1
          ? 'Se actualizo 1 subcategoria.'
          : `Se actualizaron ${result.updated} subcategorias.`,
      );
    }

    return summaryParts.length > 0
      ? `${baseMessage} ${summaryParts.join(' ')}`
      : baseMessage;
  }

  private getCategoriaSubcategoriasDetail(idCategoria: number): string {
    const visibles = this.getCategoriaSubcategorias(idCategoria);

    if (visibles.length === 0) {
      return 'Sin subcategorias asociadas';
    }

    return visibles.map((subcategoria, index) => `${index + 1}. ${subcategoria.nombre_subcategoria}`).join('\n');
  }

  private async loadSubcategoriasForCategoria(idCategoria: number): Promise<void> {
    this.loadingSubcategorias = true;
    this.loadedSubcategorias = [];
    this.subcategoriasSectionEnabled = false;
    this.resetSubcategoriaFields();

    try {
      const subcategorias = await firstValueFrom(
        this.http
          .get<Subcategoria[]>(this.subcategoriasUrl, {
            params: { id_usuario: this.currentUserId },
          })
          .pipe(timeout(10000)),
      );
      const visibles = filterVisibleForCurrentUser(subcategorias, this.currentUserId);
      const subcategoriasCategoria = visibles
        .filter((subcategoria) => subcategoria.id_categoria === idCategoria)
        .sort((a, b) =>
          a.nombre_subcategoria.localeCompare(b.nombre_subcategoria),
        );

      this.catalogSubcategorias = visibles;
      this.loadedSubcategorias = subcategoriasCategoria;
      this.subcategoriasSectionEnabled = this.isSubcategoriaAppendMode || subcategoriasCategoria.length > 0;
      this.resetSubcategoriaFields(
        subcategoriasCategoria.map((subcategoria) => subcategoria.nombre_subcategoria),
        subcategoriasCategoria.map((subcategoria) => subcategoria.id_subcategoria),
      );
    } catch {
      this.loadedSubcategorias = [];
      this.subcategoriasSectionEnabled = false;
      this.resetSubcategoriaFields();
      this.errorMessage =
        'No se pudieron cargar las subcategorias de la categoria seleccionada.';
      await this.alerts.error('Error al cargar', this.errorMessage);
    } finally {
      this.loadingSubcategorias = false;
      this.cdr.detectChanges();
    }
  }

  private setCategoriaEditMode(mode: 'full' | 'subcategorias' | null): void {
    this.categoriaEditMode = mode;

    const { nombre_categoria, descripcion, estado } = this.categoriaForm.controls;
    const shouldLockCategoriaFields = mode === 'subcategorias';

    if (shouldLockCategoriaFields) {
      nombre_categoria.disable({ emitEvent: false });
      descripcion.disable({ emitEvent: false });
      estado.disable({ emitEvent: false });
    } else {
      nombre_categoria.enable({ emitEvent: false });
      descripcion.enable({ emitEvent: false });
      estado.enable({ emitEvent: false });
    }

    this.syncLoadedSubcategoriaControlsState();
  }

  private syncLoadedSubcategoriaControlsState(): void {
    this.subcategoriaControls.forEach((control, index) => {
      const subcategoriaId = this.subcategoriaFieldIds[index] ?? null;
      const loadedSubcategoria = this.loadedSubcategorias.find(
        (subcategoria) => subcategoria.id_subcategoria === subcategoriaId,
      );
      const shouldDisable = loadedSubcategoria ? !this.canManageSubcategoria(loadedSubcategoria) : false;

      if (shouldDisable) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }
}
