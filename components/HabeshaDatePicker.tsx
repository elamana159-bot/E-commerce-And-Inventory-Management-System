import React, { useState, useEffect } from "react";
import {
  ETHIOPIAN_MONTHS,
  gregorianToEthiopian,
  ethiopianToGregorian,
  getDaysInEthiopianMonth,
  formatEthDate,
} from "@/lib/ethiopianCalendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, RotateCcw, Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface HabeshaDatePickerProps {
  value: string; // ISO date string: YYYY-MM-DD
  onChange: (isoDate: string) => void;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  showGcToggle?: boolean;
}

export const HabeshaDatePicker: React.FC<HabeshaDatePickerProps> = ({
  value,
  onChange,
  label,
  id,
  className = "",
  disabled = false,
  compact = false,
  showGcToggle = true,
}) => {
  const [calendarMode, setCalendarMode] = useState<"ethiopian" | "gregorian">("ethiopian");

  // Parse current value to Ethiopian
  const ethDate = gregorianToEthiopian(value || new Date());
  const [selectedYear, setSelectedYear] = useState<number>(ethDate.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(ethDate.month);
  const [selectedDay, setSelectedDay] = useState<number>(ethDate.day);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const ed = gregorianToEthiopian(value);
      setSelectedYear(ed.year);
      setSelectedMonth(ed.month);
      setSelectedDay(ed.day);
    }
  }, [value]);

  // Generate Year options (5 years back and 5 years ahead of today)
  const currentEthYear = gregorianToEthiopian(new Date()).year;
  const yearOptions: number[] = [];
  for (let y = currentEthYear - 6; y <= currentEthYear + 6; y++) {
    yearOptions.push(y);
  }
  if (!yearOptions.includes(selectedYear)) {
    yearOptions.push(selectedYear);
    yearOptions.sort((a, b) => a - b);
  }

  // Days in selected Ethiopian month & year
  const maxDays = getDaysInEthiopianMonth(selectedYear, selectedMonth);
  const dayOptions = Array.from({ length: maxDays }, (_, i) => i + 1);

  // Handlers
  const handleYearChange = (yearStr: string) => {
    const y = parseInt(yearStr, 10);
    setSelectedYear(y);
    const mDays = getDaysInEthiopianMonth(y, selectedMonth);
    const d = Math.min(selectedDay, mDays);
    setSelectedDay(d);
    const converted = ethiopianToGregorian(y, selectedMonth, d);
    onChange(converted.iso);
  };

  const handleMonthChange = (monthStr: string) => {
    const m = parseInt(monthStr, 10);
    setSelectedMonth(m);
    const mDays = getDaysInEthiopianMonth(selectedYear, m);
    const d = Math.min(selectedDay, mDays);
    setSelectedDay(d);
    const converted = ethiopianToGregorian(selectedYear, m, d);
    onChange(converted.iso);
  };

  const handleDayChange = (dayStr: string) => {
    const d = parseInt(dayStr, 10);
    setSelectedDay(d);
    const converted = ethiopianToGregorian(selectedYear, selectedMonth, d);
    onChange(converted.iso);
  };

  const handleSetToday = () => {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const ethToday = gregorianToEthiopian(today);
    setSelectedYear(ethToday.year);
    setSelectedMonth(ethToday.month);
    setSelectedDay(ethToday.day);
    onChange(isoToday);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <Label htmlFor={id} className="text-xs font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
            <CalendarIcon className="w-3.5 h-3.5 text-primary" />
            {label}
          </Label>
        )}
        {showGcToggle && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCalendarMode(m => (m === "ethiopian" ? "gregorian" : "ethiopian"))}
              className="text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors border bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center gap-1"
              title="የቀን አቆጣጠር ቀይር (Switch Calendar)"
            >
              {calendarMode === "ethiopian" ? (
                <>
                  <span className="text-amber-600 font-bold">🇪🇹 ሐበሻ</span>
                  <span className="text-muted-foreground text-[10px]">(ቀይር)</span>
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3 text-blue-500" />
                  <span className="text-blue-600 font-bold">🌐 GC</span>
                  <span className="text-muted-foreground text-[10px]">(ቀይር)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {calendarMode === "ethiopian" ? (
        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-lg p-2 transition-all">
          <div className="grid grid-cols-12 gap-1.5 items-center">
            {/* Day */}
            <div className="col-span-3">
              <span className="text-[10px] text-amber-900/70 dark:text-amber-300/70 font-medium block mb-0.5">ቀን (Day)</span>
              <Select
                value={String(selectedDay)}
                onValueChange={handleDayChange}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/60 font-medium px-2">
                  <SelectValue placeholder="ቀን" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {dayOptions.map(d => (
                    <SelectItem key={d} value={String(d)} className="text-xs">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month */}
            <div className="col-span-5">
              <span className="text-[10px] text-amber-900/70 dark:text-amber-300/70 font-medium block mb-0.5">ወር (Month)</span>
              <Select
                value={String(selectedMonth)}
                onValueChange={handleMonthChange}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/60 font-semibold px-2">
                  <SelectValue placeholder="ወር" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {ETHIOPIAN_MONTHS.map(m => (
                    <SelectItem key={m.id} value={String(m.id)} className="text-xs">
                      {m.nameAm} ({m.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="col-span-4">
              <span className="text-[10px] text-amber-900/70 dark:text-amber-300/70 font-medium block mb-0.5">ዓመት (Year)</span>
              <Select
                value={String(selectedYear)}
                onValueChange={handleYearChange}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/60 font-medium px-2">
                  <SelectValue placeholder="ዓመት" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y} ዓ.ም
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Summary and "Today" action */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-amber-200/50 dark:border-amber-800/30 text-[11px]">
            <span className="text-amber-900 dark:text-amber-300 font-medium truncate">
              🇪🇹 {formatEthDate(value, { short: false })}
            </span>
            <button
              type="button"
              onClick={handleSetToday}
              className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 font-semibold text-[10px] flex items-center gap-0.5 shrink-0 ml-1 hover:underline cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" /> ዛሬ (Today)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Input
            id={id}
            type="date"
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className="h-8 text-xs"
          />
          <div className="text-[11px] text-muted-foreground">
            🇪🇹 {formatEthDate(value, { short: false })}
          </div>
        </div>
      )}
    </div>
  );
};
export default HabeshaDatePicker;
