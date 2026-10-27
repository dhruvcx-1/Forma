import { useUnits } from '@/hooks/useUnits';
import { displayWeight, displayLength } from '@/lib/units';
import { cn } from '@/lib/utils';

interface UnitDisplayProps {
  /** Value in base unit (kg for weight, cm for length) */
  value: number;
  type: 'weight' | 'length' | 'custom';
  customUnit?: string;
  decimals?: number;
  className?: string;
  showUnit?: boolean;
}

export function UnitDisplay({
  value,
  type,
  customUnit,
  decimals = 1,
  className,
  showUnit = true,
}: UnitDisplayProps) {
  const { units, weightUnit, lengthUnit } = useUnits();

  let displayValue: number;
  let unit: string;

  if (type === 'weight') {
    displayValue = displayWeight(value, units);
    unit = weightUnit;
  } else if (type === 'length') {
    displayValue = displayLength(value, units);
    unit = lengthUnit;
  } else {
    displayValue = value;
    unit = customUnit ?? '';
  }

  return (
    <span className={cn('tabular-nums', className)}>
      {displayValue.toFixed(decimals)}
      {showUnit && unit && <span className="text-muted-foreground ml-0.5 text-[0.85em]">{unit}</span>}
    </span>
  );
}
