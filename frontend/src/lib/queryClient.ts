import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Background data (others' edits, quotes) updates by manual refresh / polling, not push (§5.8).
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // don't retry auth/permission/validation errors
        if (error instanceof ApiError) {
          if ([400, 401, 403, 404, 409, 422].includes(error.status)) return false;
        }
        return failureCount < 1;
      },
    },
  },
});
