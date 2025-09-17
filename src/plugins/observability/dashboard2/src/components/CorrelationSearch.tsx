import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  ClockIcon,
  UserIcon,
  CogIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface CorrelationSearchProps {
  value: string;
  onChange: (value: string) => void;
}

// Mock suggestions for now - will be replaced with GraphQL when backend is ready
const mockSuggestions = [
  {
    id: '1',
    correlation_id: 'event_detector.job.550e8400',
    source_function: 'event-detector-rides',
    user_email: 'driver@hopdrive.com',
    status: 'completed',
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    correlation_id: 'user@example.com',
    source_function: 'event-detector-users',
    user_email: 'user@example.com',
    status: 'failed',
    created_at: new Date().toISOString()
  }
];

const CorrelationSearch: React.FC<CorrelationSearchProps> = ({ value, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(newValue.length >= 2);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (value.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const clearSearch = () => {
    onChange('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <div className="w-2 h-2 bg-green-500 rounded-full" />;
      case 'failed':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      case 'running':
        return <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />;
      default:
        return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  const filteredSuggestions = mockSuggestions.filter(suggestion =>
    suggestion.correlation_id?.toLowerCase().includes(value.toLowerCase()) ||
    suggestion.user_email?.toLowerCase().includes(value.toLowerCase()) ||
    suggestion.source_function?.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={`
          relative flex items-center border rounded-lg transition-all duration-200
          ${isFocused
            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
            : 'border-gray-300 dark:border-gray-600'
          }
          bg-white dark:bg-gray-700
        `}
      >
        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 ml-3 flex-shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Search by correlation ID, function, or event..."
          className="flex-1 px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 border-none outline-none"
        />

        {value && (
          <button
            onClick={clearSearch}
            className="p-1 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-80 overflow-auto"
          >
            {filteredSuggestions.length === 0 && value.length >= 2 && (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found for "{value}"
              </div>
            )}

            {filteredSuggestions.length > 0 && (
              <div className="py-2">
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  Recent Matches
                </div>
                {filteredSuggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleSuggestionClick(suggestion.correlation_id || suggestion.user_email || suggestion.source_function)}
                    className="w-full px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-b-0"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(suggestion.status)}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          {suggestion.correlation_id && (
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono truncate">
                              {suggestion.correlation_id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                          {suggestion.source_function && (
                            <div className="flex items-center space-x-1">
                              <CogIcon className="h-3 w-3" />
                              <span>{suggestion.source_function}</span>
                            </div>
                          )}

                          {suggestion.user_email && (
                            <div className="flex items-center space-x-1">
                              <UserIcon className="h-3 w-3" />
                              <span className="truncate">{suggestion.user_email}</span>
                            </div>
                          )}

                          <div className="flex items-center space-x-1">
                            <ClockIcon className="h-3 w-3" />
                            <span>{new Date(suggestion.created_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Search Tips */}
            {value.length < 2 && (
              <div className="p-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="space-y-2">
                  <p className="font-medium">Search Tips:</p>
                  <ul className="space-y-1 ml-2">
                    <li>• Type at least 2 characters to search</li>
                    <li>• Search by correlation ID, user email, or function name</li>
                    <li>• Use partial matches to find related invocations</li>
                  </ul>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CorrelationSearch;