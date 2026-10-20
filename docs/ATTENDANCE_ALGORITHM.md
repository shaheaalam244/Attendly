# Attendance Verification Algorithm (`docs/ATTENDANCE_ALGORITHM.md`)

## Core Verification Rules

1. **Minimum Qualifying Presence**:
   A student becomes eligible for automatic `PRESENT` status only after **at least 30 minutes (`1800` seconds)** of verified inside-geofence evidence is accumulated during configured working hours (`09:00`–`17:00` default in college timezone).
2. **Maximum Evidence Gap Protection**:
   Consecutive inside-geofence observations separated by more than `maxEvidenceGapMinutes` (default `15` minutes) are **never** bridged. An unverified 30-minute gap between two timestamps yields `0` seconds of verified duration for that gap.
3. **Geofence Exit & Re-Entry**:
   An `EXIT` event or an observation outside `radiusMeters` closes the current interval immediately. Re-entering on the same day starts a new interval without erasing already verified duration from earlier in the day.
4. **Attendance Percentage Formula**:
   $$\text{Attendance \%} = \frac{\text{Present Eligible Working Days}}{\text{Total Eligible Working Days (Present + Absent)}} \times 100$$
   - Holidays (`HOLIDAY`), weekly non-working days, future dates (`NOT_DETECTED`), and uncertain/untracked dates (`UNKNOWN`) are strictly excluded from the denominator.
   - When `Eligible Working Days == 0`, the system outputs `"No eligible working days"`.
