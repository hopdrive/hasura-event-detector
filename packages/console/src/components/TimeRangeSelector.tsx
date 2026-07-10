import React, { useState, useMemo } from 'react';
import { Popover } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { format } from 'date-fns';
import { resolveTimeRange } from '../utils/resolveTimeRange';

const PRESETS = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
] as const;

interface TimeRangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

function toLocalInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ value, onChange }) => {
  const resolved = useMemo(() => resolveTimeRange(value), [value]);
  const [startInput, setStartInput] = useState(() => toLocalInput(new Date(resolved.start)));
  const [endInput, setEndInput] = useState(() => toLocalInput(new Date(resolved.end)));
  const [error, setError] = useState('');

  // Keep inputs in sync when value changes externally (e.g. preset click)
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const r = resolveTimeRange(value);
    setStartInput(toLocalInput(new Date(r.start)));
    setEndInput(toLocalInput(new Date(r.end)));
    setError('');
  }

  function applyDates() {
    const s = new Date(startInput);
    const e = new Date(endInput);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) { setError('Invalid date'); return; }
    if (s >= e) { setError('Start must be before end'); return; }
    setError('');
    onChange(`custom:${s.toISOString()}|${e.toISOString()}`);
  }

  function applyPreset(preset: string) {
    onChange(preset);
  }

  // Display label
  const startDate = new Date(resolved.start);
  const endDate = new Date(resolved.end);
  const sameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
  const displayLabel = sameDay
    ? `${format(startDate, 'MMM d')}  ${format(startDate, 'HH:mm')} — ${format(endDate, 'HH:mm')}`
    : `${format(startDate, 'MMM d HH:mm')} — ${format(endDate, 'MMM d HH:mm')}`;

  return (
    <Popover className='relative'>
      {({ close }) => (
        <>
          <Popover.Button className='flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors'>
            <span className='whitespace-nowrap'>{displayLabel}</span>
            <ChevronDownIcon className='h-4 w-4 text-gray-400' />
          </Popover.Button>

          <Popover.Panel className='absolute right-0 z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800 p-4'>
            <div className='space-y-3'>
              {/* Quick presets */}
              <div>
                <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5'>
                  Quick select
                </label>
                <div className='flex gap-1.5'>
                  {PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { applyPreset(p.value); close(); }}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        value === p.value
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      }`}
                    >
                      {p.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* From / To inputs */}
              <div>
                <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                  From
                </label>
                <input
                  type='datetime-local'
                  value={startInput}
                  onChange={e => { setStartInput(e.target.value); setError(''); }}
                  className='w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'
                />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'>
                  To
                </label>
                <input
                  type='datetime-local'
                  value={endInput}
                  onChange={e => { setEndInput(e.target.value); setError(''); }}
                  className='w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'
                />
              </div>

              {error && <p className='text-xs text-red-500'>{error}</p>}

              <div className='flex justify-end gap-2 pt-1'>
                <button
                  onClick={() => close()}
                  className='px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  Cancel
                </button>
                <button
                  onClick={() => { applyDates(); close(); }}
                  className='px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'
                >
                  Apply
                </button>
              </div>
            </div>
          </Popover.Panel>
        </>
      )}
    </Popover>
  );
};

export default TimeRangeSelector;
