import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

export function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    A: 'text-green-600 dark:text-green-400',
    B: 'text-blue-600 dark:text-blue-400',
    C: 'text-yellow-600 dark:text-yellow-400',
    D: 'text-orange-600 dark:text-orange-400',
    F: 'text-red-600 dark:text-red-400',
  };
  return colors[grade] || 'text-gray-600 dark:text-gray-400';
}

export function getGradeBgColor(grade: string): string {
  const colors: Record<string, string> = {
    A: 'bg-green-100 dark:bg-green-900/30',
    B: 'bg-blue-100 dark:bg-blue-900/30',
    C: 'bg-yellow-100 dark:bg-yellow-900/30',
    D: 'bg-orange-100 dark:bg-orange-900/30',
    F: 'bg-red-100 dark:bg-red-900/30',
  };
  return colors[grade] || 'bg-gray-100 dark:bg-gray-900/30';
}

export function getRiskColor(level: string): string {
  const colors: Record<string, string> = {
    high: 'text-red-600 dark:text-red-400',
    medium: 'text-orange-600 dark:text-orange-400',
    low: 'text-green-600 dark:text-green-400',
  };
  return colors[level] || 'text-gray-600 dark:text-gray-400';
}

export function getRiskBgColor(level: string): string {
  const colors: Record<string, string> = {
    high: 'bg-red-100 dark:bg-red-900/30',
    medium: 'bg-orange-100 dark:bg-orange-900/30',
    low: 'bg-green-100 dark:bg-green-900/30',
  };
  return colors[level] || 'bg-gray-100 dark:bg-gray-900/30';
}