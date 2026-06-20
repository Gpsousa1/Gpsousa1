import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Idempotent FASE 1 seed: base roles, a starter permission and a bootstrap
 * admin user. Safe to run multiple times.
 */
async function main() {
  // Roles
  const roles = [
    { name: RoleName.MEI, description: 'Microempreendedor Individual (cliente final)' },
    { name: RoleName.PARTNER, description: 'Parceiro financeiro / correspondente' },
    { name: RoleName.ADMIN, description: 'Operação interna Lucrom' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  // Permission: read the audit trail (used to demonstrate RBAC enforcement)
  const readAudit = await prisma.permission.upsert({
    where: { action_resource: { action: 'read', resource: 'audit' } },
    update: {},
    create: { action: 'read', resource: 'audit', description: 'Read audit logs' },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.ADMIN },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: { roleId: adminRole.id, permissionId: readAudit.id },
    },
    update: {},
    create: { roleId: adminRole.id, permissionId: readAudit.id },
  });

  // Bootstrap admin user
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@lucrom.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(password, rounds);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: 'Lucrom Admin', status: 'ACTIVE' },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // eslint-disable-next-line no-console
  console.log(`Seed complete. Admin user: ${email}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
