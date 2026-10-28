import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, TrendingDown, TrendingUp, Calendar, Scale } from 'lucide-react';
import type { BmiHistoryPoint } from '@/types/api';
import { displayWeight, weightUnit, formatHeight } from '@/lib/units';
import { formatDate } from '@/lib/utils';

interface BmiHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: BmiHistoryPoint[];
  units: 'metric' | 'imperial';
  heightCm: number | null;
}

export function BmiHistoryModal({
  open,
  onOpenChange,
  history,
  units,
  heightCm,
}: BmiHistoryModalProps) {
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // Chronological copy with delta computation
  const sorted = useMemo(() => {
    // Original chronological order
    const list = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const withDeltas = list.map((item, idx) => {
      const prev = idx > 0 ? list[idx - 1] : null;
      const weightDelta = prev ? item.weightKg - prev.weightKg : null;
      const bmiDelta = prev ? parseFloat((item.bmi - prev.bmi).toFixed(1)) : null;
      return {
        ...item,
        weightDelta,
        bmiDelta,
      };
    });

    // Sort by user preference (default latest first)
    return sortAsc ? withDeltas : withDeltas.reverse();
  }, [history, sortAsc]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (item) =>
        item.date.includes(q) ||
        item.category.toLowerCase().includes(q) ||
        formatDate(item.date).toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'Underweight':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/30';
      case 'Normal weight':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'Overweight':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'Obese':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1">
          <div className="flex items-center justify-between gap-4 pr-6">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span>BMI & Weight History</span>
            </DialogTitle>
            {heightCm && (
              <Badge variant="outline" className="text-xs font-normal">
                Height: {formatHeight(heightCm, units)}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete chronological record of your Body Mass Index and weight measurements ({history.length} {history.length === 1 ? 'entry' : 'entries'}).
          </DialogDescription>
        </DialogHeader>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2 pt-2 pb-1 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by date or category..."
              className="pl-8 h-8 text-xs bg-secondary/40"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortAsc((v) => !v)}
            className="h-8 text-xs gap-1.5 shrink-0"
            title={sortAsc ? 'Showing oldest first' : 'Showing newest first'}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{sortAsc ? 'Oldest' : 'Newest'}</span>
          </Button>
        </div>

        {/* Scrollable Table */}
        <div className="flex-1 overflow-y-auto no-scrollbar rounded-xl border border-border/70 mt-2">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No matching records found.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-secondary/60 text-muted-foreground sticky top-0 backdrop-blur-sm z-10 border-b border-border">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Weight</th>
                  <th className="py-2.5 px-3 font-medium">BMI</th>
                  <th className="py-2.5 px-3 font-medium">Category</th>
                  <th className="py-2.5 px-3 font-medium text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((row) => {
                  const dispW = displayWeight(row.weightKg, units);
                  return (
                    <tr
                      key={row.date}
                      className="hover:bg-secondary/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDate(row.date)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-semibold text-foreground whitespace-nowrap">
                        {dispW.toFixed(1)}{' '}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {weightUnit(units)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-bold text-foreground">
                        {row.bmi.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 font-medium border ${getCategoryBadgeClass(
                            row.category
                          )}`}
                        >
                          {row.category}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap tabular-nums">
                        {row.bmiDelta !== null && row.bmiDelta !== 0 ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                              row.bmiDelta < 0
                                ? 'text-emerald-500'
                                : 'text-rose-500'
                            }`}
                          >
                            {row.bmiDelta < 0 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <TrendingUp className="h-3 w-3" />
                            )}
                            {row.bmiDelta > 0 ? `+${row.bmiDelta}` : row.bmiDelta}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
