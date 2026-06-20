import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface LedgerEntryInput {
  accountCode: string;
  tipo: LedgerEntryType;
  valor: number;
  descricao?: string;
}

export interface PostTransactionInput {
  reference?: string;
  descricao: string;
  entries: LedgerEntryInput[];
}

/**
 * Double-entry ledger. Replicates the frontend `LedgerEngine` balance rule
 * (validarBalanco: |debitos - creditos| < 0.01). No financial movement is
 * persisted unless debits equal credits.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  validarBalanco(entries: LedgerEntryInput[]) {
    const debitos = entries
      .filter((e) => e.tipo === LedgerEntryType.DEBITO)
      .reduce((a, e) => a + e.valor, 0);
    const creditos = entries
      .filter((e) => e.tipo === LedgerEntryType.CREDITO)
      .reduce((a, e) => a + e.valor, 0);
    return { ok: Math.abs(debitos - creditos) < 0.01, debitos, creditos };
  }

  /**
   * Posts a balanced transaction atomically. Accepts an optional Prisma
   * transaction client so callers (e.g. credit release) can include the
   * ledger posting in the same DB transaction.
   */
  async post(input: PostTransactionInput, tx?: Prisma.TransactionClient) {
    if (!input.entries || input.entries.length < 2) {
      throw new BadRequestException('A ledger transaction requires at least two entries');
    }
    const balance = this.validarBalanco(input.entries);
    if (!balance.ok) {
      throw new BadRequestException(
        `Unbalanced ledger transaction: débitos=${balance.debitos} créditos=${balance.creditos}`,
      );
    }
    const db = tx ?? this.prisma;
    return db.ledgerTransaction.create({
      data: {
        reference: input.reference,
        descricao: input.descricao,
        balanced: true,
        entries: {
          create: input.entries.map((e) => ({
            accountCode: e.accountCode,
            tipo: e.tipo,
            valor: e.valor,
            descricao: e.descricao,
          })),
        },
      },
      include: { entries: true },
    });
  }

  /** Convenience helper: a single debit/credit pair (classic double entry). */
  async postDoubleEntry(
    params: {
      debitAccount: string;
      creditAccount: string;
      valor: number;
      descricao: string;
      reference?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.post(
      {
        reference: params.reference,
        descricao: params.descricao,
        entries: [
          { accountCode: params.debitAccount, tipo: LedgerEntryType.DEBITO, valor: params.valor },
          { accountCode: params.creditAccount, tipo: LedgerEntryType.CREDITO, valor: params.valor },
        ],
      },
      tx,
    );
  }

  async balance(accountCode: string) {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { accountCode } });
    const debitos = entries
      .filter((e) => e.tipo === LedgerEntryType.DEBITO)
      .reduce((a, e) => a + e.valor, 0);
    const creditos = entries
      .filter((e) => e.tipo === LedgerEntryType.CREDITO)
      .reduce((a, e) => a + e.valor, 0);
    return { accountCode, debitos, creditos, saldo: Math.round((debitos - creditos) * 100) / 100 };
  }

  listAccounts() {
    return this.prisma.ledgerAccount.findMany({ orderBy: { code: 'asc' } });
  }

  listTransactions(take = 50) {
    return this.prisma.ledgerTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      include: { entries: true },
    });
  }

  /** Reconciliation: marks a transaction as reconciled. */
  async reconcile(id: string) {
    const exists = await this.prisma.ledgerTransaction.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Ledger transaction not found');
    return this.prisma.ledgerTransaction.update({
      where: { id },
      data: { reconciled: true },
    });
  }
}
