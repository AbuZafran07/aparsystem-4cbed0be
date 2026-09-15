import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export interface ReportSectionRow {
  key: string;
  label: string;
  values: number[];
}

interface ReportSectionTableProps {
  title: string;
  accountLabel: string;
  columnHeaders: string[];
  rows: ReportSectionRow[];
  totalLabel: string;
  totalValues: number[];
  formatCurrency: (n: number) => string;
  showDiffColumn?: boolean;
  diffLabel?: string;
  emptyLabel: string;
}

export function ReportSectionTable({
  title, accountLabel, columnHeaders, rows, totalLabel, totalValues,
  formatCurrency, showDiffColumn, diffLabel = 'Selisih', emptyLabel,
}: ReportSectionTableProps) {
  const diff = (vals: number[]) => (vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0);
  const colSpan = 1 + columnHeaders.length + (showDiffColumn ? 1 : 0);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{accountLabel}</TableHead>
              {columnHeaders.map((h, i) => (
                <TableHead key={i} className="text-right whitespace-nowrap">{h}</TableHead>
              ))}
              {showDiffColumn && <TableHead className="text-right whitespace-nowrap">{diffLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-6 text-muted-foreground text-sm">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  {r.values.map((v, i) => (
                    <TableCell key={i} className="text-right text-sm whitespace-nowrap">{formatCurrency(v)}</TableCell>
                  ))}
                  {showDiffColumn && (
                    <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(diff(r.values))}</TableCell>
                  )}
                </TableRow>
              ))
            )}
            <TableRow className="font-medium border-t-2">
              <TableCell>{totalLabel}</TableCell>
              {totalValues.map((v, i) => (
                <TableCell key={i} className="text-right whitespace-nowrap">{formatCurrency(v)}</TableCell>
              ))}
              {showDiffColumn && (
                <TableCell className="text-right whitespace-nowrap">{formatCurrency(diff(totalValues))}</TableCell>
              )}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
