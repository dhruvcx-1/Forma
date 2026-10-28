import React from 'react';
import { motion } from 'framer-motion';

export interface BodyPin {
  slug: string;
  name: string;
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  latestValue?: number | null;
  delta?: number | null;
  unit: string;
}

interface BodyMapSilhouetteProps {
  pins: BodyPin[];
  selectedSlug?: string | null;
  onSelectPin: (slug: string) => void;
  sex?: 'male' | 'female' | 'other';
}

export function BodyMapSilhouette({
  pins,
  selectedSlug,
  onSelectPin,
}: BodyMapSilhouetteProps) {
  return (
    <div className="relative w-full max-w-[280px] sm:max-w-[320px] mx-auto aspect-[1/2] select-none flex items-center justify-center">
      {/* SVG Stylized Human Figure */}
      <svg
        viewBox="0 0 200 400"
        className="w-full h-full drop-shadow-md text-secondary/70 stroke-border/60"
        fill="currentColor"
        strokeWidth="1.5"
      >
        {/* Head */}
        <ellipse cx="100" cy="35" rx="18" ry="24" className="fill-secondary/60" />
        
        {/* Neck */}
        <path d="M93 58 L107 58 L109 72 L91 72 Z" className="fill-secondary/60" />
        
        {/* Torso & Shoulders */}
        <path
          d="M91 72 
             C72 75 58 84 50 102 
             C47 110 44 140 40 170 
             C38 185 36 210 32 235 
             C30 245 32 250 36 248 
             C41 245 46 220 50 195 
             C54 175 57 155 60 145 
             C62 140 64 165 66 185 
             C69 205 70 215 76 225 
             C82 235 90 240 100 240 
             C110 240 118 235 124 225 
             C130 215 131 205 134 185 
             C136 165 138 140 140 145 
             C143 155 146 175 150 195 
             C154 220 159 245 164 248 
             C168 250 170 245 168 235 
             C164 210 162 185 160 170 
             C156 140 153 110 150 102 
             C142 84 128 75 109 72 Z"
          className="fill-secondary/60"
        />

        {/* Legs & Feet */}
        <path
          d="M78 230 
             C76 245 74 275 72 305 
             C70 330 68 360 65 385 
             C64 392 68 395 74 395 
             C80 395 83 388 85 370 
             C88 345 92 315 94 285 
             C95 270 96 255 100 245 
             C104 255 105 270 106 285 
             C108 315 112 345 115 370 
             C117 388 120 395 126 395 
             C132 395 136 392 135 385 
             C132 360 130 330 128 305 
             C126 275 124 245 122 230 
             C116 238 108 243 100 243 
             C92 243 84 238 78 230 Z"
          className="fill-secondary/60"
        />

        {/* Subtle contour anatomical line accents */}
        <path d="M85 115 Q100 122 115 115" fill="none" className="stroke-foreground/15" strokeWidth="1" />
        <path d="M88 165 Q100 170 112 165" fill="none" className="stroke-foreground/15" strokeWidth="1" />
        <path d="M82 210 Q100 216 118 210" fill="none" className="stroke-foreground/15" strokeWidth="1" />
      </svg>

      {/* Interactive Markers Overlaid */}
      {pins.map((pin) => {
        const isSelected = selectedSlug === pin.slug;
        const hasData = pin.latestValue !== undefined && pin.latestValue !== null;

        return (
          <div
            key={pin.slug}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group z-20"
          >
            <button
              type="button"
              onClick={() => onSelectPin(pin.slug)}
              className={`relative flex items-center justify-center w-6 h-6 rounded-full transition-all cursor-pointer ${
                isSelected
                  ? 'scale-125 ring-4 ring-primary/30 bg-primary text-white shadow-lg'
                  : hasData
                  ? 'bg-primary/80 hover:bg-primary text-white hover:scale-110 shadow-sm'
                  : 'bg-muted-foreground/60 hover:bg-primary/80 text-white hover:scale-110'
              }`}
              title={`${pin.name}: ${hasData ? `${pin.latestValue} ${pin.unit}` : 'Not measured'}`}
            >
              {isSelected && (
                <span className="absolute inset-0 rounded-full animate-ping bg-primary opacity-60" />
              )}
              <span className="w-2 h-2 rounded-full bg-white" />
            </button>

            {/* Hover / Active Floating Chip */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 whitespace-nowrap pointer-events-none transition-all duration-200 ${
                isSelected
                  ? 'opacity-100 scale-100 translate-y-0'
                  : 'opacity-0 scale-95 translate-y-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0'
              }`}
            >
              <div className="bg-popover text-popover-foreground border border-border shadow-xl rounded-lg px-2 py-1 text-[11px] font-semibold flex items-center gap-1.5">
                <span>{pin.name}</span>
                {hasData && (
                  <span className="text-primary font-bold">
                    {pin.latestValue} {pin.unit}
                  </span>
                )}
                {pin.delta !== null && pin.delta !== undefined && pin.delta !== 0 && (
                  <span
                    className={`text-[10px] ${
                      pin.delta < 0 ? 'text-emerald-500' : 'text-blue-500'
                    }`}
                  >
                    ({pin.delta > 0 ? `+${pin.delta}` : pin.delta})
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
