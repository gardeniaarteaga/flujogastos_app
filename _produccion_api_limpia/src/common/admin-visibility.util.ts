import { ObjectLiteral, Repository } from 'typeorm';

import { Usuario } from '../usuarios/entities/usuario.entity';

const ADMIN_ROLE_ID = 1;

export async function listAdminUserIds(
  repository: Repository<ObjectLiteral>,
): Promise<number[]> {
  const admins = await repository.manager.getRepository(Usuario).find({
    select: { id_usuario: true },
    where: { id_rol: ADMIN_ROLE_ID },
    order: { id_usuario: 'ASC' },
  });

  return Array.from(new Set(admins.map((admin) => admin.id_usuario)));
}

export async function buildVisibleUserIds(
  repository: Repository<ObjectLiteral>,
  currentUserId: number,
): Promise<number[]> {
  return Array.from(new Set([...(await listAdminUserIds(repository)), currentUserId]));
}

export function isAdminOwned(
  adminUserIds: readonly number[],
  ownerUserId: number | null | undefined,
): boolean {
  return ownerUserId !== null && ownerUserId !== undefined && adminUserIds.includes(ownerUserId);
}
