import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  FunnelIcon,
  ArrowsUpDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import InvocationDetailDrawer from './InvocationDetailDrawer';
import { useInvocationsListQuery } from '../types/generated';
import { Node } from 'reactflow';

// Define the Invocation type
interface Invocation {
  id: string;
  sourceFunction: string;
  correlationId: string;
  userEmail: string;
  sourceOperation: string;
  totalDuration: number;
  eventsDetectedCount: number;
  totalJobsSucceeded: number;
  totalJobsFailed: number;
  totalJobsRun: number;
  status: 'completed' | 'failed' | 'running';
  createdAt: string;
}

const columnHelper = createColumnHelper<Invocation>();

const InvocationsTable = () => {
  const [selectedInvocation, setSelectedInvocation] = useState<Node | null>(null);

  // GraphQL Query
  const { data: queryData, loading, error } = useInvocationsListQuery({
    variables: {
      limit: 1000,
      offset: 0,
      order_by: [{ created_at: 'desc' }]
    },
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: false
  });

  const invocationsData = useMemo(() => {
    const invocations = queryData?.invocations || [];

    return invocations.map(inv => ({
      id: inv.id,
      sourceFunction: inv.source_function || '',
      correlationId: inv.correlation_id || '',
      userEmail: inv.source_user_email || '',
      sourceOperation: inv.source_operation || '',
      totalDuration: inv.total_duration_ms || 0,
      eventsDetectedCount: inv.events_detected_count || 0,
      totalJobsSucceeded: inv.total_jobs_succeeded || 0,
      totalJobsFailed: inv.total_jobs_failed || 0,
      totalJobsRun: inv.total_jobs_run || 0,
      status: inv.status as 'completed' | 'failed' | 'running',
      createdAt: inv.created_at,
    }));
  }, [queryData]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
  });

  const handleRowClick = (invocation: Invocation) => {
    // Convert invocation data to Node format for the drawer
    const node: Node = {
      id: invocation.id,
      type: 'invocation',
      position: { x: 0, y: 0 },
      data: {
        sourceFunction: invocation.sourceFunction,
        correlationId: invocation.correlationId,
        status: invocation.status,
        duration: invocation.totalDuration,
        eventsCount: invocation.eventsDetectedCount
      }
    };
    setSelectedInvocation(node);
    setDrawerOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusStyles = {
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    };

    return (
      <span className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${statusStyles[status as keyof typeof statusStyles]}
      `}>
        {status}
      </span>
    );
  };

  const getSuccessRate = (succeeded: number, total: number) => {
    if (total === 0) return 100;
    return Math.round((succeeded / total) * 100);
  };

  const columns = useMemo<ColumnDef<Invocation>[]>(
    () => [
      columnHelper.accessor('sourceFunction', {
        id: 'sourceFunction',
        header: 'Source Function',
        cell: (info) => (
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {info.getValue()}
          </div>
        ),
        filterFn: 'includesString',
      }),
      columnHelper.accessor('correlationId', {
        id: 'correlationId',
        header: 'Correlation ID',
        cell: (info) => (
          <div className="text-gray-600 dark:text-gray-400 font-mono text-sm">
            <span className="truncate max-w-xs inline-block">
              {info.getValue()}
            </span>
          </div>
        ),
        filterFn: 'includesString',
      }),
      columnHelper.accessor('userEmail', {
        id: 'userEmail',
        header: 'User',
        cell: (info) => (
          <div className="text-gray-600 dark:text-gray-400 text-sm">
            {info.getValue()}
          </div>
        ),
        filterFn: 'includesString',
      }),
      columnHelper.accessor('sourceOperation', {
        id: 'sourceOperation',
        header: 'Operation',
        cell: (info) => (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 rounded">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('totalDuration', {
        id: 'totalDuration',
        header: 'Duration',
        cell: (info) => (
          <div className="text-gray-600 dark:text-gray-400 text-sm">
            {info.getValue()}ms
          </div>
        ),
      }),
      columnHelper.accessor('eventsDetectedCount', {
        id: 'eventsDetectedCount',
        header: 'Events',
        cell: (info) => (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'jobs',
        header: 'Jobs',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center space-x-1">
              <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded">
                {row.totalJobsSucceeded}
              </span>
              {row.totalJobsFailed > 0 && (
                <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded">
                  {row.totalJobsFailed}
                </span>
              )}
            </div>
          );
        }
      }),
      columnHelper.display({
        id: 'successRate',
        header: 'Success Rate',
        cell: (info) => {
          const row = info.row.original;
          const successRate = getSuccessRate(row.totalJobsSucceeded, row.totalJobsRun);
          return (
            <div className="flex items-center space-x-2">
              <span className="text-gray-900 dark:text-gray-100 font-medium text-sm">
                {successRate}%
              </span>
              <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    successRate >= 90 ? 'bg-green-500' :
                    successRate >= 70 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          );
        }
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (info) => getStatusBadge(info.getValue()),
        filterFn: 'equals',
      }),
      columnHelper.accessor('createdAt', {
        id: 'createdAt',
        header: 'Created',
        cell: (info) => (
          <div className="text-gray-600 dark:text-gray-400 text-sm">
            {new Date(info.getValue()).toLocaleString()}
          </div>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: () => (
          <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        ),
        size: 50,
      }),
    ],
    []
  );

  const table = useReactTable({
    data: invocationsData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    debugTable: false,
  });


  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Invocations</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Loading invocations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Invocations</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-yellow-600 dark:text-yellow-400 mb-2">Invocations data unavailable</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The observability database may not be connected.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              {error.message}
            </p>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Invocations
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {table.getFilteredRowModel().rows.length} of {invocationsData.length} invocations
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Global Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(String(e.target.value))}
                className="pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500"
                placeholder="Search all fields..."
              />
            </div>

            {/* Status Filter */}
            <select
              value={
                (table.getColumn('status')?.getFilterValue() as string) ?? 'all'
              }
              onChange={(e) => {
                const value = e.target.value;
                table.getColumn('status')?.setFilterValue(value === 'all' ? undefined : value);
              }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>

            <button className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
              <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2" />
              Columns
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center space-x-1 ${
                            canSort ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200' : ''
                          }`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {canSort && (
                            <span className="ml-1">
                              {sorted === false ? (
                                <ChevronUpDownIcon className="h-4 w-4" />
                              ) : sorted === 'asc' ? (
                                <ChevronUpIcon className="h-4 w-4" />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {table.getRowModel().rows.map((row) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => handleRowClick(row.original)}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-6 py-4 whitespace-nowrap text-sm"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No invocations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Showing{' '}
            <span className="font-medium">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}
            </span>{' '}
            of <span className="font-medium">{table.getFilteredRowModel().rows.length}</span> results
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {[25, 50, 100, 200].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  Show {pageSize}
                </option>
              ))}
            </select>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {drawerOpen && selectedInvocation && (
          <InvocationDetailDrawer
            node={selectedInvocation}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default InvocationsTable;