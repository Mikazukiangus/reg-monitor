// Saving a file the page made (CSV, JSON, calendar, dossier text) to the
// visitor's device. The only place that builds a download link.
export function saveFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const FILE_TYPES = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  text: 'text/plain;charset=utf-8',
  calendar: 'text/calendar;charset=utf-8'
} as const;
