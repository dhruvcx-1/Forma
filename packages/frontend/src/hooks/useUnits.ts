import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { User } from '@/types/api';
import { useAuth } from './useAuth';
import { weightUnit, lengthUnit } from '@/lib/units';

export function useUnits() {
  const { data: auth } = useAuth();
  const units = auth?.user?.unit_system ?? auth?.user?.units ?? 'metric';
  return {
    units,
    weightUnit: weightUnit(units),
    lengthUnit: lengthUnit(units),
  };
}

export function useUpdateUnits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (units: 'metric' | 'imperial') =>
      api.put('/settings', { unit_system: units }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
