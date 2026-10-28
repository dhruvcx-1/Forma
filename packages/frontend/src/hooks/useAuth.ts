import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthStatus, SetupStatus } from '@/types/api';

export function useSetupStatus() {
  return useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: () => api.get<SetupStatus>('/setup/status'),
    staleTime: Infinity,
    retry: false,
  });
}

export function useAuth() {
  return useQuery<AuthStatus>({
    queryKey: ['auth'],
    queryFn: () => api.get<AuthStatus>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    onSuccess: () => {
      queryClient.setQueryData(['auth'], null);
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}
