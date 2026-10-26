import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { MedicationWithSchedule, ProfileRow } from '../db/types';
import { FOOD_LABELS } from './foodLabels';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function describeSchedule(item: MedicationWithSchedule): string {
  if (item.medication.is_prn) return 'Take as needed';
  if (!item.schedule) return '';

  const times = JSON.parse(item.schedule.times) as string[];
  if (times.length === 0) return 'Take as needed';

  const days = item.schedule.days_of_week
    ? (JSON.parse(item.schedule.days_of_week) as number[])
    : null;
  const timesLabel = times.map(formatTime12h).join(', ');
  const daysLabel = days ? days.map((d) => DAY_LABELS[d]).join(', ') : 'Every day';
  return `${timesLabel} · ${daysLabel}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(profile: ProfileRow, medications: MedicationWithSchedule[]): string {
  const generatedAt = new Date().toLocaleString([], { dateStyle: 'long', timeStyle: 'short' });

  const rows = medications
    .map((item) => {
      const food = item.schedule ? FOOD_LABELS[item.schedule.food_preference] : '';
      return `
        <tr>
          <td>
            <div class="med-name">${escapeHtml(item.medication.name)}</div>
            ${item.medication.form ? `<div class="med-form">${escapeHtml(item.medication.form)}</div>` : ''}
          </td>
          <td>${escapeHtml(item.medication.strength ?? '')}</td>
          <td>${escapeHtml(describeSchedule(item))}</td>
          <td>${escapeHtml(food)}</td>
          <td>${item.medication.notes ? escapeHtml(item.medication.notes) : ''}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1A1A1A; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .subtitle { color: #555; margin-bottom: 24px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ddd; padding: 8px 6px; }
          td { padding: 10px 6px; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
          .med-name { font-weight: 600; }
          .med-form { font-size: 12px; color: #666; }
          .disclaimer { margin-top: 32px; font-size: 11px; color: #888; line-height: 1.5; }
        </style>
      </head>
      <body>
        <h1>Current Medications for ${escapeHtml(profile.name)}</h1>
        <div class="subtitle">Generated ${escapeHtml(generatedAt)} · Dosely</div>
        <table>
          <thead>
            <tr>
              <th>Medication</th>
              <th>Strength</th>
              <th>Schedule</th>
              <th>Food</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No medications on file.</td></tr>'}
          </tbody>
        </table>
        <div class="disclaimer">
          This summary is provided for informational purposes and is not medical advice.
          Always verify current medications and dosages with a pharmacist or doctor.
        </div>
      </body>
    </html>
  `;
}

export async function exportMedicationSummary(
  profile: ProfileRow,
  medications: MedicationWithSchedule[]
): Promise<void> {
  const html = buildHtml(profile, medications);
  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return;

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${profile.name}'s medication summary`,
  });
}
