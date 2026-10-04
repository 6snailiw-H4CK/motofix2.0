import { CalendarDays } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type DateInputProps = {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  max?: string;
  min?: string;
  name?: string;
  required?: boolean;
  title?: string;
  'aria-label'?: string;
};

const toIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return '';

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : '';
};

const toDisplayDate = (value: string) => {
  const isoDate = toIsoDate(value);
  return isoDate ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}` : '';
};

const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const toIsoFromDisplay = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return '';

  const [, day, month, year] = match;
  return toIsoDate(`${year}-${month}-${day}`);
};

const adjustDateSegment = (
  value: string,
  amount: number,
  segment: 'day' | 'month',
  min?: string,
  max?: string
) => {
  const isoDate = toIsoDate(value);
  if (!isoDate) return '';

  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  let nextValue: string;

  if (segment === 'month') {
    const monthDate = new Date(Date.UTC(year, month - 1 + amount, 1));
    const nextYear = monthDate.getUTCFullYear();
    const nextMonth = monthDate.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
    nextValue = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDayOfMonth)).padStart(2, '0')}`;
  } else {
    const dayDate = new Date(Date.UTC(year, month - 1, day + amount));
    nextValue = `${dayDate.getUTCFullYear()}-${String(dayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(dayDate.getUTCDate()).padStart(2, '0')}`;
  }

  const minDate = toIsoDate(min || '');
  const maxDate = toIsoDate(max || '');

  if (minDate && nextValue < minDate) nextValue = minDate;
  if (maxDate && nextValue > maxDate) nextValue = maxDate;
  return nextValue;
};

export const DateInput = ({
  value = '',
  onChange,
  className = '',
  disabled = false,
  id,
  max,
  min,
  name,
  required = false,
  title,
  'aria-label': ariaLabel,
}: DateInputProps) => {
  const isoDate = toIsoDate(value);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const monthPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [displayValue, setDisplayValue] = useState(() => toDisplayDate(isoDate));

  const selectDateSegment = (segment: 'day' | 'month') => {
    const start = segment === 'day' ? 0 : 3;
    requestAnimationFrame(() => {
      textInputRef.current?.setSelectionRange(start, start + 2);
    });
  };

  useEffect(() => {
    setDisplayValue(toDisplayDate(isoDate));
  }, [isoDate]);

  const handleTextChange = (nextValue: string, selectionStart: number | null) => {
    monthPointerRef.current = null;
    const digitsBeforeCaret = nextValue.slice(0, selectionStart ?? nextValue.length).replace(/\D/g, '').length;
    const formattedValue = formatDateInput(nextValue);
    setDisplayValue(formattedValue);
    let caretPosition = 0;
    let digitsFound = 0;
    while (caretPosition < formattedValue.length && digitsFound < digitsBeforeCaret) {
      if (/\d/.test(formattedValue[caretPosition])) digitsFound += 1;
      caretPosition += 1;
    }
    if (formattedValue[caretPosition] === '/') caretPosition += 1;
    requestAnimationFrame(() => {
      textInputRef.current?.setSelectionRange(caretPosition, caretPosition);
    });

    const parsedDate = toIsoFromDisplay(formattedValue);
    if (!formattedValue || parsedDate) onChange(parsedDate);
  };

  const handleTextClick = (selectionStart: number | null, clientX: number, clientY: number) => {
    if (selectionStart !== null && selectionStart <= 2) {
      monthPointerRef.current = { x: clientX, y: clientY };
      selectDateSegment('day');
    } else if (selectionStart !== null && selectionStart >= 3 && selectionStart <= 5) {
      monthPointerRef.current = { x: clientX, y: clientY };
      selectDateSegment('month');
    } else {
      monthPointerRef.current = null;
    }
  };

  useEffect(() => {
    const input = textInputRef.current;
    if (!input) return;

    const handleWheel = (event: WheelEvent) => {
      const monthPointer = monthPointerRef.current;
      const pointerStayedAtMonth = monthPointer
        && Math.abs(event.clientX - monthPointer.x) <= 8
        && Math.abs(event.clientY - monthPointer.y) <= 8;
      const wheelOverInput = event.composedPath().includes(input);
      const selectedSegment = input.selectionStart === 0 && input.selectionEnd === 2
        ? 'day'
        : input.selectionStart === 3 && input.selectionEnd === 5
          ? 'month'
          : null;
      if (
        document.activeElement !== input
        || !selectedSegment
        || (!wheelOverInput && !pointerStayedAtMonth)
        || !isoDate
        || event.deltaY === 0
      ) return;

      event.preventDefault();
      const nextDate = adjustDateSegment(isoDate, event.deltaY < 0 ? 1 : -1, selectedSegment, min, max);
      if (!nextDate || nextDate === isoDate) return;

      setDisplayValue(toDisplayDate(nextDate));
      onChange(nextDate);
      selectDateSegment(selectedSegment);
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [isoDate, max, min, onChange]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    const input = event.currentTarget;
    const selectedSegment = input.selectionStart === 0 && input.selectionEnd === 2
      ? 'day'
      : input.selectionStart === 3 && input.selectionEnd === 5
        ? 'month'
        : null;
    if (!selectedSegment || !isoDate) return;

    event.preventDefault();
    const nextDate = adjustDateSegment(
      isoDate,
      event.key === 'ArrowUp' ? 1 : -1,
      selectedSegment,
      min,
      max
    );
    if (!nextDate || nextDate === isoDate) return;

    setDisplayValue(toDisplayDate(nextDate));
    onChange(nextDate);
    selectDateSegment(selectedSegment);
  };

  return (
    <div className="relative min-w-0">
      <input
        id={id}
        ref={textInputRef}
        type="text"
        inputMode="numeric"
        maxLength={10}
        placeholder="dd/mm/aaaa"
        value={displayValue}
        onChange={(event) => handleTextChange(event.target.value, event.currentTarget.selectionStart)}
        onClick={(event) => handleTextClick(event.currentTarget.selectionStart, event.clientX, event.clientY)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          monthPointerRef.current = null;
          setDisplayValue(toDisplayDate(toIsoFromDisplay(displayValue) || isoDate));
        }}
        disabled={disabled}
        required={required}
        title={title}
        aria-label={ariaLabel}
        className={`${className} pr-10`}
      />
      <CalendarDays className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="date"
        value={isoDate}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDisplayValue(toDisplayDate(nextValue));
          onChange(nextValue);
        }}
        min={min}
        max={max}
        name={name}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 cursor-pointer opacity-0"
      />
    </div>
  );
};