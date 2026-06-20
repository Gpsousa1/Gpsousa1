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

  // ── FASE 2 catalogs (mirror INIT_MISSIONS and EDU_VIDEOS exactly) ──
  const missions = [
    { code: 1, title: 'Registre sua primeira receita', xp: 50, icon: '💰', cat: 'Finanças', recompensaCredito: 500 },
    { code: 2, title: 'Organize seu fluxo de caixa', xp: 25, icon: '📊', cat: 'Finanças', recompensaCredito: 300 },
    { code: 3, title: 'Declare a DASN em dia', xp: 100, icon: '📋', cat: 'Impostos', recompensaCredito: 1200 },
    { code: 4, title: 'Pague seu primeiro DAS', xp: 75, icon: '✅', cat: 'Impostos', recompensaCredito: 800 },
    { code: 5, title: 'Emita seu Certificado CCFV', xp: 80, icon: '🏆', cat: 'Certificados', recompensaCredito: 900 },
    { code: 6, title: 'Emita sua primeira Nota Fiscal', xp: 60, icon: '📄', cat: 'Docs', recompensaCredito: 700 },
  ];
  for (const m of missions) {
    await prisma.mission.upsert({ where: { code: m.code }, update: m, create: m });
  }

  const videos = [
    { code: 'v1', titulo: 'Gestão de Fluxo de Caixa', dur: '18 min', xp: 20, cat: 'Finanças', emoji: '📊' },
    { code: 'v2', titulo: 'DAS e DASN-SIMEI', dur: '22 min', xp: 25, cat: 'Impostos', emoji: '📋' },
    { code: 'v3', titulo: 'Como Aumentar seu Score', dur: '14 min', xp: 20, cat: 'Score', emoji: '🎯' },
    { code: 'v4', titulo: 'Nota Fiscal: Passo a Passo', dur: '20 min', xp: 20, cat: 'Docs', emoji: '📄' },
  ];
  for (const v of videos) {
    await prisma.educationVideo.upsert({ where: { code: v.code }, update: v, create: v });
  }

  // ── FASE 3: fraud rules (mirror FraudEngine points) ──
  const fraudRules = [
    { code: 'FAT_ALTO', descricao: 'Faturamento > 80% do teto MEI', pontos: 20 },
    { code: 'MULTIPLAS_SOLICITACOES', descricao: 'Mais de 1 operação em análise', pontos: 30 },
    { code: 'VELOCITY_ALTA', descricao: 'Mais de 10 transações em 24h', pontos: 25 },
    { code: 'ROUND_NUMBERS', descricao: '>=50% das transações com valores redondos >= R$5k', pontos: 15 },
    { code: 'MICRO_FARMING', descricao: '>=10 receitas < R$50 nas últimas 20', pontos: 20 },
  ];
  for (const r of fraudRules) {
    await prisma.fraudRule.upsert({ where: { code: r.code }, update: r, create: r });
  }

  // ── FASE 3: ledger chart of accounts (mínimo para o release de crédito) ──
  const accounts = [
    { code: '1.1.1', name: 'Caixa', type: 'ASSET' },
    { code: '1.1.2', name: 'Crédito Concedido', type: 'ASSET' },
    { code: '2.1.1', name: 'Obrigações a Pagar', type: 'LIABILITY' },
    { code: '3.1.1', name: 'Receita de Comissões', type: 'REVENUE' },
  ];
  for (const a of accounts) {
    await prisma.ledgerAccount.upsert({ where: { code: a.code }, update: a, create: a });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete. Admin: ${email}. Missions: ${missions.length}, Videos: ${videos.length}, FraudRules: ${fraudRules.length}, LedgerAccounts: ${accounts.length}`,
  );
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
