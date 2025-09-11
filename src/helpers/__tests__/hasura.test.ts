/**
 * Hasura Helper Tests
 * 
 * Tests for Hasura event parsing and analysis functions.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { parseHasuraEvent, columnHasChanged } from '../hasura.js';
import { createMockHasuraEvent } from '../../../tests/test-utils.js';
import type { HasuraEventData } from '../../types/index.js';

describe('Hasura Helpers', () => {
  describe('parseHasuraEvent', () => {
    it('should parse a valid Hasura event', () => {
      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        old: { id: 1, name: 'old_name', active: false },
        new: { id: 1, name: 'new_name', active: true },
        sessionVariables: {
          'x-hasura-role': 'user',
          'x-hasura-user-id': '123',
          'x-hasura-user-email': 'test@example.com'
        },
        eventId: 'test-event-123',
        createdAt: '2024-01-01T12:00:00Z'
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.hasuraEventTime).toBe('2024-01-01T12:00:00Z');
      expect(result.hasuraEventId).toBe('test-event-123');
      expect(result.operation).toBe('UPDATE');
      expect(result.role).toBe('user');
      expect(result.user).toBe('test@example.com');
      expect(result.dbEvent?.old).toEqual({ id: 1, name: 'old_name', active: false });
      expect(result.dbEvent?.new).toEqual({ id: 1, name: 'new_name', active: true });
    });

    it('should handle INSERT operation', () => {
      const hasuraEvent = createMockHasuraEvent({
        operation: 'INSERT',
        new: { id: 1, name: 'new_user', active: true }
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.operation).toBe('INSERT');
      expect(result.dbEvent?.new).toEqual({ id: 1, name: 'new_user', active: true });
      expect(result.dbEvent?.old).toBeUndefined();
    });

    it('should handle DELETE operation', () => {
      const hasuraEvent = createMockHasuraEvent({
        operation: 'DELETE',
        old: { id: 1, name: 'deleted_user', active: true }
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.operation).toBe('DELETE');
      expect(result.dbEvent?.old).toEqual({ id: 1, name: 'deleted_user', active: true });
      expect(result.dbEvent?.new).toBeUndefined();
    });

    it('should default user to system for admin role', () => {
      const hasuraEvent = createMockHasuraEvent({
        sessionVariables: {
          'x-hasura-role': 'admin'
          // No user email provided
        }
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.role).toBe('admin');
      expect(result.user).toBe('system');
    });

    it('should handle missing session variables gracefully', () => {
      const hasuraEvent = createMockHasuraEvent({
        sessionVariables: {}
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.role).toBeUndefined();
      expect(result.user).toBeNull();
    });

    it('should handle malformed session variables', () => {
      const hasuraEvent = createMockHasuraEvent();
      // Remove session variables entirely
      delete hasuraEvent.event.session_variables;

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.role).toBeUndefined();
      expect(result.user).toBe(null);
    });

    it('should handle missing event data gracefully', () => {
      const hasuraEvent = createMockHasuraEvent();
      // Remove event data
      delete (hasuraEvent.event as any).data;

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.dbEvent).toBeUndefined();
      expect(result.operation).toBe('UPDATE'); // Operation comes from hasuraEvent.event.op, not data
    });

    it('should handle errors in parsing gracefully', () => {
      const malformedEvent = {
        // Missing required properties that would cause errors
      } as any;

      const result = parseHasuraEvent(malformedEvent);

      // Should return an object with minimal data, not throw
      expect(result).toEqual({ user: null });
    });

    it('should handle generic typing correctly', () => {
      interface UserData {
        id: number;
        email: string;
        profile: {
          firstName: string;
          lastName: string;
        };
      }

      const hasuraEvent = createMockHasuraEvent({
        old: { 
          id: 1, 
          email: 'old@example.com',
          profile: { firstName: 'Old', lastName: 'Name' }
        },
        new: { 
          id: 1, 
          email: 'new@example.com',
          profile: { firstName: 'New', lastName: 'Name' }
        }
      });

      const result = parseHasuraEvent<UserData>(hasuraEvent);

      expect(result.dbEvent?.old?.email).toBe('old@example.com');
      expect(result.dbEvent?.new?.profile?.firstName).toBe('New');
    });

    it('should preserve all session variables', () => {
      const customSessionVars = {
        'x-hasura-role': 'user',
        'x-hasura-user-id': '123',
        'x-hasura-user-email': 'test@example.com',
        'x-hasura-custom-claim': 'custom-value',
        'x-hasura-org-id': 'org-456'
      };

      const hasuraEvent = createMockHasuraEvent({
        sessionVariables: customSessionVars
      });

      const result = parseHasuraEvent(hasuraEvent);

      expect(result.sessionVariables).toEqual(customSessionVars);
    });
  });

  describe('columnHasChanged', () => {
    let hasuraData: HasuraEventData;

    beforeEach(() => {
      hasuraData = {
        old: { 
          id: 1, 
          name: 'old_name', 
          active: false, 
          count: 5,
          nullable_field: null 
        },
        new: { 
          id: 1, 
          name: 'new_name', 
          active: true, 
          count: 5,
          nullable_field: 'now_has_value'
        }
      };
    });

    it('should detect when a column has changed', () => {
      expect(columnHasChanged('name', hasuraData)).toBe(true);
      expect(columnHasChanged('active', hasuraData)).toBe(true);
      expect(columnHasChanged('nullable_field', hasuraData)).toBe(true);
    });

    it('should detect when a column has not changed', () => {
      expect(columnHasChanged('id', hasuraData)).toBe(false);
      expect(columnHasChanged('count', hasuraData)).toBe(false);
    });

    it('should handle missing column names', () => {
      expect(columnHasChanged('', hasuraData)).toBe(false);
      expect(columnHasChanged('nonexistent_column', hasuraData)).toBe(false);
    });

    it('should handle missing old record', () => {
      const insertData = {
        new: { id: 1, name: 'new_record' }
      } as HasuraEventData;

      expect(columnHasChanged('name', insertData)).toBe(false);
    });

    it('should handle missing new record', () => {
      const deleteData = {
        old: { id: 1, name: 'deleted_record' }
      } as HasuraEventData;

      expect(columnHasChanged('name', deleteData)).toBe(false);
    });

    it('should handle null/undefined hasuraData', () => {
      expect(columnHasChanged('any_column', null as any)).toBe(false);
      expect(columnHasChanged('any_column', undefined as any)).toBe(false);
    });

    it('should handle changes from null to value', () => {
      const data: HasuraEventData = {
        old: { field: null },
        new: { field: 'value' }
      };

      expect(columnHasChanged('field', data)).toBe(true);
    });

    it('should handle changes from value to null', () => {
      const data: HasuraEventData = {
        old: { field: 'value' },
        new: { field: null }
      };

      expect(columnHasChanged('field', data)).toBe(true);
    });

    it('should handle both null values as unchanged', () => {
      const data: HasuraEventData = {
        old: { field: null },
        new: { field: null }
      };

      expect(columnHasChanged('field', data)).toBe(false);
    });

    it('should handle complex object changes', () => {
      const data: HasuraEventData = {
        old: { metadata: { version: 1, config: { enabled: true } } },
        new: { metadata: { version: 2, config: { enabled: true } } }
      };

      expect(columnHasChanged('metadata', data)).toBe(true);
    });

    it('should handle array changes', () => {
      const data: HasuraEventData = {
        old: { tags: ['tag1', 'tag2'] },
        new: { tags: ['tag1', 'tag2', 'tag3'] }
      };

      expect(columnHasChanged('tags', data)).toBe(true);
    });

    it('should handle errors gracefully', () => {
      // Create malformed data that might cause errors
      const malformedData = {
        old: { field: 'value' },
        new: null
      } as any;

      expect(columnHasChanged('field', malformedData)).toBe(false);
    });

    it('should be case sensitive for column names', () => {
      expect(columnHasChanged('Name', hasuraData)).toBe(false); // Capital N
      expect(columnHasChanged('name', hasuraData)).toBe(true);  // Lowercase n
    });

    it('should handle numeric zero vs null/undefined', () => {
      const data: HasuraEventData = {
        old: { count: null },
        new: { count: 0 }
      };

      expect(columnHasChanged('count', data)).toBe(true);
    });

    it('should handle boolean false vs null/undefined', () => {
      const data: HasuraEventData = {
        old: { active: null },
        new: { active: false }
      };

      expect(columnHasChanged('active', data)).toBe(true);
    });
  });
});