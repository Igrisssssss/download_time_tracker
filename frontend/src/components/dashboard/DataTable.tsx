import type { ReactNode } from 'react';
import SurfaceCard from './SurfaceCard';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  title: string;
  description?: string;
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
  headerAction?: ReactNode;
}

export default function DataTable<T>({
  title,
  description,
  columns,
  rows,
  emptyMessage,
  headerAction,
}: DataTableProps<T>) {
  return (
    <SurfaceCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 ${column.className || ''}`.trim()}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100/90">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-5 py-3 align-top text-slate-700 ${column.className || ''}`.trim()}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}
