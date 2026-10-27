import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = 'hsl(262 83% 58%)', height = 30 }: SparklineProps) {
  const chartData = useMemo(() => data.map((v, i) => ({ v, i })), [data]);

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
