"use client";
/* eslint-disable @next/next/no-img-element -- Equipment photos are local data URLs before cloud sync. */

import {
  Activity,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Dumbbell,
  Eye,
  EyeOff,
  Filter,
  Flame,
  History,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { LOOPREP_SESSIONS } from "./looprep-data";
import { loadAppData, saveAppData } from "./storage";
import { authenticateOwner } from "./auth";

export const dynamic = "force-static";

type Tab = "workout" | "nutrition" | "progress";
type WorkoutView = "templates" | "equipment";
type Sheet =
  | "equipment"
  | "template"
  | "meal"
  | "target"
  | "exercise"
  | "set"
  | null;

type Equipment = {
  id: string;
  name: string;
  primaryMuscle: string;
  type: string;
  photos?: string[];
  notes?: string;
  createdAt: string;
};

type Exercise = {
  id: string;
  name: string;
  equipmentId: string;
  primaryMuscle: string;
  repMin: number;
  repMax: number;
};

type Template = {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: string;
};

type SetLog = {
  id: string;
  weightKg: number;
  reps: number;
  rir?: number;
  type: "working" | "warmup";
  completedAt: string;
};

type WorkoutExercise = {
  exerciseId: string;
  sets: SetLog[];
  notes?: string;
};

type ExerciseDraftSet = {
  id: string;
  weightKg: string;
  reps: string;
};

type ActiveWorkout = {
  id: string;
  name: string;
  startedAt: string;
  exercises: WorkoutExercise[];
};

type WorkoutSession = ActiveWorkout & { completedAt: string };

type Meal = {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
};

type NutritionTarget = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type AppData = {
  equipment: Equipment[];
  exercises: Exercise[];
  templates: Template[];
  sessions: WorkoutSession[];
  activeWorkout: ActiveWorkout | null;
  meals: Meal[];
  nutritionTarget: NutritionTarget;
};

const EMPTY_DATA: AppData = {
  equipment: [],
  exercises: [],
  templates: [],
  sessions: [],
  activeWorkout: null,
  meals: [],
  nutritionTarget: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

function exerciseForEquipment(equipment: Equipment, name?: string): Exercise {
  return {
    id: uid(),
    name: name?.trim() || equipment.name,
    equipmentId: equipment.id,
    primaryMuscle: equipment.primaryMuscle,
    repMin: 8,
    repMax: 12,
  };
}

// Equipment saved without an exercise name used to stay invisible in the exercise
// picker, which lists exercises only. Give every machine a default exercise so it
// is loggable the moment it is added.
function withEquipmentExercises(base: AppData): AppData {
  const missing = base.equipment.filter((equipment) => !base.exercises.some((exercise) => exercise.equipmentId === equipment.id));
  if (missing.length === 0) return base;
  return { ...base, exercises: [...base.exercises, ...missing.map((equipment) => exerciseForEquipment(equipment))] };
}

function mergeLoopRepHistory(base: AppData): AppData {
  const exerciseSeeds = new Map<string, { muscle: string }>();
  LOOPREP_SESSIONS.forEach(([, exercises]) => exercises.forEach(([name, muscle]) => exerciseSeeds.set(name, { muscle })));

  const equipment = [...base.equipment];
  const exercises = [...base.exercises];
  const exerciseIds = new Map<string, string>();

  exerciseSeeds.forEach(({ muscle }, name) => {
    const existingExercise = exercises.find((exercise) => exercise.name === name);
    if (existingExercise) {
      exerciseIds.set(name, existingExercise.id);
      return;
    }

    let linkedEquipment = equipment.find((item) => item.name === name);
    if (!linkedEquipment) {
      linkedEquipment = {
        id: `looprep-equipment:${name}`,
        name,
        primaryMuscle: muscle,
        type: name.includes("كيبل") ? "كيبل" : "آلة",
        notes: "مستورد من LoopRep",
        createdAt: "2026-03-31T18:00:00+03:00",
      };
      equipment.push(linkedEquipment);
    }

    const exercise: Exercise = {
      id: `looprep-exercise:${name}`,
      name,
      equipmentId: linkedEquipment.id,
      primaryMuscle: muscle,
      repMin: 6,
      repMax: 12,
    };
    exercises.push(exercise);
    exerciseIds.set(name, exercise.id);
  });

  const existingSessionIds = new Set(base.sessions.map((session) => session.id));
  const importedSessions: WorkoutSession[] = LOOPREP_SESSIONS.flatMap(([date, sessionExercises]) => {
    const sessionId = `looprep-session:${date}`;
    if (existingSessionIds.has(sessionId)) return [];
    const muscleNames = Array.from(new Set(sessionExercises.map(([, muscle]) => muscle)));
    const startedAt = `${date}T18:00:00+03:00`;
    const completedAt = `${date}T19:00:00+03:00`;
    return [{
      id: sessionId,
      name: `${muscleNames.join(" + ")} Day`,
      startedAt,
      completedAt,
      exercises: sessionExercises.map(([name, , sets, note], exerciseIndex) => ({
        exerciseId: exerciseIds.get(name) ?? `looprep-exercise:${name}`,
        notes: note,
        sets: sets.map(([reps, weightKg], setIndex) => ({
          id: `${sessionId}:exercise-${exerciseIndex}:set-${setIndex}`,
          reps,
          weightKg,
          type: "working" as const,
          completedAt: `${date}T18:${String(10 + exerciseIndex * 6 + setIndex).padStart(2, "0")}:00+03:00`,
        })),
      })),
    }];
  });

  if (
    equipment.length === base.equipment.length
    && exercises.length === base.exercises.length
    && importedSessions.length === 0
  ) return base;

  return { ...base, equipment, exercises, sessions: [...base.sessions, ...importedSessions] };
}

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Legs"] as const;
type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = { Chest: "صدر", Back: "ظهر", Shoulders: "أكتاف", Arms: "ذراعين", Legs: "أرجل" };
// Decorative category colors for exercise chips — distinct from --accent (state).
const MUSCLE_GROUP_COLOR_VAR: Record<MuscleGroup, string> = { Chest: "--cat-chest", Back: "--cat-back", Shoulders: "--cat-shoulders", Arms: "--cat-arms", Legs: "--cat-legs" };

function muscleGroupColorVar(value: string) {
  const group = muscleGroupFor(value);
  return group ? MUSCLE_GROUP_COLOR_VAR[group] : "--subtle";
}

const BUILT_IN_EXERCISES: Exercise[] = [
  { id: "built-in-bench-press", name: "بنش برس", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 6, repMax: 12 },
  { id: "built-in-incline-press", name: "بنش مائل", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 8, repMax: 12 },
  { id: "built-in-chest-fly", name: "باترفلاي", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 10, repMax: 15 },
  { id: "built-in-push-up", name: "تمرين الضغط", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 8, repMax: 20 },
  { id: "built-in-lat-pulldown", name: "سحب أمامي", equipmentId: "built-in", primaryMuscle: "Back", repMin: 8, repMax: 12 },
  { id: "built-in-seated-row", name: "تجديف جالس", equipmentId: "built-in", primaryMuscle: "Back", repMin: 8, repMax: 12 },
  { id: "built-in-barbell-row", name: "تجديف بار", equipmentId: "built-in", primaryMuscle: "Back", repMin: 6, repMax: 12 },
  { id: "built-in-pull-up", name: "عقلة", equipmentId: "built-in", primaryMuscle: "Back", repMin: 5, repMax: 12 },
  { id: "built-in-shoulder-press", name: "ضغط أكتاف", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 6, repMax: 12 },
  { id: "built-in-lateral-raise", name: "رفرفة جانبية", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 10, repMax: 20 },
  { id: "built-in-rear-delt-fly", name: "رفرفة خلفية", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 10, repMax: 20 },
  { id: "built-in-biceps-curl", name: "باي بار", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-hammer-curl", name: "هامر كيرل", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-triceps-pushdown", name: "تراي بوش داون", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-overhead-triceps", name: "تراي فوق الرأس", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-squat", name: "سكوات", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 5, repMax: 12 },
  { id: "built-in-leg-press", name: "ليق بريس", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 8, repMax: 15 },
  { id: "built-in-leg-extension", name: "ليق إكستنشن", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 15 },
  { id: "built-in-leg-curl", name: "ليق كيرل", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 15 },
  { id: "built-in-hip-thrust", name: "هيب ثرست", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 8, repMax: 15 },
  { id: "built-in-calf-raise", name: "رفع سمانة", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 20 },
];

const EQUIPMENT_TYPES = ["آلة", "كيبل", "أوزان حرة", "بار", "وزن جسم", "أخرى"];
const MEAL_CATEGORIES = ["فطور", "غداء", "عشاء", "سناك", "قبل التمرين", "بعد التمرين"];
const NAVIGATION: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "workout", label: "التمرين", icon: Dumbbell },
  { id: "nutrition", label: "التغذية", icon: Utensils },
  { id: "progress", label: "التقدم", icon: TrendingUp },
];

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function muscleGroupFor(value: string): MuscleGroup | null {
  if (MUSCLE_GROUPS.includes(value as MuscleGroup)) return value as MuscleGroup;
  if (/صدر/.test(value)) return "Chest";
  if (/ظهر/.test(value)) return "Back";
  if (/كتف|أكتاف/.test(value)) return "Shoulders";
  if (/باي|تراي|ذراع|سواعد/.test(value)) return "Arms";
  if (/رجل|أرجل|فخذ|سمانة|بطات|ألوية/.test(value)) return "Legs";
  return null;
}

function muscleGroupLabel(value: string) {
  const group = muscleGroupFor(value);
  return group ? MUSCLE_GROUP_LABELS[group] : value;
}

function readNumericInput(value: string) {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٫،,]/g, ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

const ARABIC_WITH_LATIN_NUMBERS = "ar-SA-u-ca-gregory-nu-latn";
const ARABIC_WEEK_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const ARABIC_WEEK_INITIALS = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

function calendarDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function shiftDate(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnSelectedDay(selectedDay: Date) {
  const now = new Date();
  const combined = new Date(selectedDay);
  combined.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return combined.toISOString();
}

// The day strip keeps the selected day centred, with two days either side.
function daysAround(value: Date, radius = 2) {
  const start = shiftDate(value, -radius);
  return Array.from({ length: radius * 2 + 1 }, (_, index) => shiftDate(start, index));
}

const LATIN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shiftMonth(value: Date, months: number) {
  const next = new Date(value.getFullYear(), value.getMonth() + months, 1, 12);
  return next;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
    hour: "numeric",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

/* Progress bands: amber = بدأت، أزرق = في الطريق، أخضر = وصلت، أحمر = تجاوزت */
function progressBand(current: number, target: number) {
  if (!target) return { tone: "", percent: 0, width: 0 };
  const percent = Math.round((current / target) * 100);
  const width = Math.min(100, Math.max(0, percent));
  if (percent <= 0) return { tone: "", percent, width };
  if (percent < 50) return { tone: "low", percent, width };
  if (percent < 90) return { tone: "mid", percent, width };
  if (percent <= 110) return { tone: "hit", percent, width };
  return { tone: "over", percent, width: 100 };
}

function countLabel(count: number, singularPhrase: string, pluralPhrase: string) {
  return count === 1 ? singularPhrase : `${formatNumber(count)} ${pluralPhrase}`;
}

function weekRangeLabel(count: 5 | 7 | 14 | 30) {
  if (count === 30) return "آخر شهر";
  return `آخر ${formatNumber(count)} ${count === 14 ? "يوم" : "أيام"}`;
}

function daysAgoLabel(days: number) {
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "قبل يومين";
  return `منذ ${formatNumber(days)} ${days <= 10 ? "أيام" : "يومًا"}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
    day: "numeric",
    month: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(new Date(value));
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatDayHeading(value: string) {
  return new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
    weekday: "long",
    day: "numeric",
    month: "long",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(new Date(value));
}

function isAtOrAfter(session: WorkoutSession, cutoff?: { id: string; date: string }) {
  if (!cutoff) return false;
  return session.id === cutoff.id || new Date(session.completedAt).getTime() >= new Date(cutoff.date).getTime();
}

function daysSince(value: string) {
  const then = new Date(value);
  then.setHours(12, 0, 0, 0);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86400000));
}

function sumMeal(meals: Meal[]) {
  return meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories,
      protein: sum.protein + meal.protein,
      carbs: sum.carbs + meal.carbs,
      fat: sum.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function countLoggedSets(exercises: WorkoutExercise[]) {
  return exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

function countLoggedReps(exercises: WorkoutExercise[]) {
  return exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.type === "working").reduce((setTotal, set) => setTotal + set.reps, 0),
    0,
  );
}

function workoutVolume(exercises: WorkoutExercise[]) {
  return exercises.reduce(
    (total, exercise) => total + exercise.sets
      .filter((set) => set.type === "working")
      .reduce((setTotal, set) => setTotal + set.weightKg * set.reps, 0),
    0,
  );
}

// There is no explicit "finish workout" step — an in-progress draft becomes a real,
// visible session the moment it has a logged set, keyed by its own id so repeated
// edits update the same entry instead of duplicating it.
function reconcileActiveWorkoutIntoSessions(current: AppData): AppData {
  const active = current.activeWorkout;
  if (!active) return current;
  const withoutActive = current.sessions.filter((session) => session.id !== active.id);
  if (countLoggedSets(active.exercises) === 0) {
    return { ...current, sessions: withoutActive };
  }
  const existing = current.sessions.find((session) => session.id === active.id);
  const completed: WorkoutSession = { ...active, completedAt: existing?.completedAt ?? active.startedAt };
  return { ...current, sessions: [completed, ...withoutActive] };
}

// Reconciles first (so switching days never silently drops an unsaved draft), then
// loads whichever session already exists for the target day back into activeWorkout.
function hydrateActiveWorkoutForDay(current: AppData, day: Date): AppData {
  const reconciled = reconcileActiveWorkoutIntoSessions(current);
  const existing = reconciled.sessions.find((session) => calendarDayKey(session.completedAt) === calendarDayKey(day));
  const activeWorkout: ActiveWorkout | null = existing
    ? { id: existing.id, name: existing.name, startedAt: existing.startedAt, exercises: existing.exercises }
    : null;
  return { ...reconciled, activeWorkout };
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
    image.src = src;
  });
}

// Phone cameras produce multi-MB, multi-thousand-pixel photos; storing those raw as
// base64 makes every render that paints a thumbnail (picker lists, equipment cards)
// decode a full-size image, which is what shows up as the picker "hanging".
async function readFileAsCompressedPhoto(file: File, maxDimension = 1024, quality = 0.8) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function Logo() {
  return (
    <div className="brand" aria-label="REST رست">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-rest">REST</span>
      <span className="brand-ar">رست</span>
    </div>
  );
}

function AppButton({
  children,
  onClick,
  variant = "primary",
  icon,
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  icon?: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button className={`app-button ${variant}`} onClick={onClick} disabled={disabled} type={type}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

// Shared by the Workout and Nutrition tabs: week arrows, a "today" reset, and a
// five-day strip that keeps the selected day centred.
function DaySelector({
  selectedDay,
  onSelect,
  countFor,
  label,
}: {
  selectedDay: Date;
  onSelect: (day: Date) => void;
  countFor: (day: Date) => number;
  label: string;
}) {
  return (
    <>
      <div className="day-nav">
        <button type="button" onClick={() => onSelect(shiftDate(selectedDay, -7))} aria-label="الأسبوع السابق">
          <ChevronRight size={20} />
        </button>
        <button type="button" className="day-nav-today" onClick={() => onSelect(new Date())}>اليوم</button>
        <button type="button" onClick={() => onSelect(shiftDate(selectedDay, 7))} aria-label="الأسبوع التالي">
          <ChevronLeft size={20} />
        </button>
      </div>
      <div className="day-strip" role="group" aria-label={label}>
        {daysAround(selectedDay).map((day) => {
          const key = calendarDayKey(day);
          const selected = key === calendarDayKey(selectedDay);
          const today = isToday(day.toISOString());
          const count = countFor(day);
          return (
            <button
              type="button"
              key={key}
              className={`day-card${selected ? " selected" : ""}${today ? " today" : ""}`}
              onClick={() => onSelect(day)}
              aria-pressed={selected}
              aria-label={formatDayHeading(day.toISOString())}
            >
              <span className="day-weekday">{ARABIC_WEEK_DAYS[day.getDay()]}</span>
              <b className="day-number">{day.getDate()}</b>
              <small className="day-month">{LATIN_MONTHS[day.getMonth()]}</small>
              {count > 0 && <span className="day-count"><i />{formatNumber(count)}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <div className="sheet-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onPointerDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("rest-session") === "active",
  );
  const [tab, setTab] = useState<Tab>("workout");
  const [workoutView, setWorkoutView] = useState<WorkoutView>("templates");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToastState] = useState<{ text: string; tone: "default" | "record" } | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);
  const showToast = (message: string, onUndo?: () => void, tone: "default" | "record" = "default") => {
    setToastState({ text: message, tone });
    setToastKey((key) => key + 1);
    setToastUndo(() => onUndo ?? null);
  };
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [equipmentForm, setEquipmentForm] = useState({
    name: "",
    primaryMuscle: "",
    type: "آلة",
    exerciseName: "",
    notes: "",
    photos: [] as string[],
  });
  const [templateName, setTemplateName] = useState("");
  const [templateExercises, setTemplateExercises] = useState<string[]>([]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealForm, setMealForm] = useState({
    name: "",
    category: "فطور",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const [mealError, setMealError] = useState("");
  const [targetForm, setTargetForm] = useState({ calories: "", protein: "", carbs: "", fat: "" });
  const [exerciseToAdd, setExerciseToAdd] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseDraftSets, setExerciseDraftSets] = useState<ExerciseDraftSet[]>([]);
  const [exerciseNotes, setExerciseNotes] = useState("");
  const [showExerciseNotes, setShowExerciseNotes] = useState(false);
  // Set type and RIR apply to the whole draft batch; both stay tucked behind the
  // same disclosure as notes so the default logging view matches the design.
  const [draftSetType, setDraftSetType] = useState<"working" | "warmup">("working");
  const [draftRir, setDraftRir] = useState("2");
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroup | "All">("All");
  const [equipmentMuscleGroup, setEquipmentMuscleGroup] = useState<MuscleGroup | "All">("All");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedWorkoutDate, setSelectedWorkoutDate] = useState(() => new Date());
  const [selectedMealDate, setSelectedMealDate] = useState(() => new Date());
  // Session stopwatch — a view-only timer, never persisted with the workout.
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [historyDateOverride, setHistoryDateOverride] = useState<Date | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  // Controls for the "آخر N أيام" weekly review table on the Progress tab.
  const [weekRangeDays, setWeekRangeDays] = useState<5 | 7 | 14 | 30>(5);
  const [weekRangeMenuOpen, setWeekRangeMenuOpen] = useState(false);
  const [weekFilterMenuOpen, setWeekFilterMenuOpen] = useState(false);
  const [weekMuscleFilter, setWeekMuscleFilter] = useState<MuscleGroup | "All">("All");
  const [weekOnlyTrained, setWeekOnlyTrained] = useState(false);
  const [fullHistoryExpanded, setFullHistoryExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadAppData<AppData>();
      let next = stored ?? EMPTY_DATA;
      next = withEquipmentExercises(next);
      const merged = mergeLoopRepHistory(next);
      const importedCount = merged.sessions.length - next.sessions.length;
      if (importedCount > 0) {
        next = merged;
        await saveAppData(next);
      }
      if (!active) return;
      const hydrated = hydrateActiveWorkoutForDay(next, selectedWorkoutDate);
      setData(hydrated);
      void saveAppData(hydrated);
      if (importedCount > 0) {
        showToast(`تم استيراد ${formatNumber(importedCount)} حصة من سجلك السابق`);
      }
      setLoaded(true);
    })();
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` }).catch(() => undefined);
    }
    return () => { active = false; };
    // Runs once on mount; selectedWorkoutDate's initial value (today) is what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToastState(null); setToastUndo(null); }, 5000);
    return () => window.clearTimeout(timer);
    // Keyed on toastKey (not toast itself) so firing the same message twice in a
    // row — e.g. two quick "كرر آخر مجموعة" taps — still resets the 5s timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTimerSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, workoutView]);

  const persist = (raw: AppData) => {
    const next = reconcileActiveWorkoutIntoSessions(raw);
    setData(next);
    void saveAppData(next);
  };

  // The workout editor always reflects whichever day is selected in the day-browser:
  // reconcile any dangling draft first (so nothing is lost), then load that day's
  // existing session (if any) back into activeWorkout for continued editing.
  const selectWorkoutDate = (day: Date) => {
    const hydrated = hydrateActiveWorkoutForDay(data, day);
    setSelectedWorkoutDate(day);
    setSelectedExerciseId(hydrated.activeWorkout?.exercises[0]?.exerciseId ?? "");
    persist(hydrated);
  };

  const selectedDayMeals = useMemo(
    () => data.meals
      .filter((meal) => calendarDayKey(meal.createdAt) === calendarDayKey(selectedMealDate))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.meals, selectedMealDate],
  );
  const nutrition = useMemo(() => sumMeal(selectedDayMeals), [selectedDayMeals]);
  const sortedSessions = useMemo(
    () => [...data.sessions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [data.sessions],
  );
  // First open of the log should land on something worth seeing: if today has no
  // session but earlier ones exist, default to the most recent trained day instead
  // of an empty "today". Any explicit pick by the user overrides this permanently.
  const selectedHistoryDate = useMemo(() => {
    if (historyDateOverride) return historyDateOverride;
    if (sortedSessions.some((session) => isToday(session.completedAt))) return new Date();
    return sortedSessions[0] ? new Date(sortedSessions[0].completedAt) : new Date();
  }, [historyDateOverride, sortedSessions]);
  const selectedWorkoutDaySessions = useMemo(
    () => sortedSessions.filter((session) => calendarDayKey(session.completedAt) === calendarDayKey(selectedWorkoutDate)),
    [selectedWorkoutDate, sortedSessions],
  );
  const otherSessionsForDay = useMemo(
    () => selectedWorkoutDaySessions.filter((session) => session.id !== data.activeWorkout?.id),
    [selectedWorkoutDaySessions, data.activeWorkout],
  );
  const historyMonthCells = useMemo(() => {
    const year = selectedHistoryDate.getFullYear();
    const month = selectedHistoryDate.getMonth();
    const leadingBlanks = new Date(year, month, 1, 12).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1, 12)),
    ];
  }, [selectedHistoryDate]);
  const sessionDayKeys = useMemo(
    () => new Set(data.sessions.map((session) => calendarDayKey(session.completedAt))),
    [data.sessions],
  );
  const monthSessionCount = useMemo(() => data.sessions.filter((session) => {
    const date = new Date(session.completedAt);
    return date.getFullYear() === selectedHistoryDate.getFullYear() && date.getMonth() === selectedHistoryDate.getMonth();
  }).length, [data.sessions, selectedHistoryDate]);
  const selectedDaySessions = useMemo(
    () => sortedSessions.filter((session) => calendarDayKey(session.completedAt) === calendarDayKey(selectedHistoryDate)),
    [selectedHistoryDate, sortedSessions],
  );
  const historyMonthLabel = useMemo(() => new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
    month: "long",
    year: "numeric",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(selectedHistoryDate), [selectedHistoryDate]);
  const exerciseCatalog = useMemo(
    () => [
      ...data.exercises,
      ...BUILT_IN_EXERCISES.filter((builtIn) => !data.exercises.some((exercise) => exercise.id === builtIn.id)),
    ],
    [data.exercises],
  );
  // Quick-glance weekly review for the Progress tab: today first, going back N days,
  // each paired with the distinct exercises trained that day (or "rest" if none).
  // Optionally narrowed to one muscle group via weekMuscleFilter.
  const weekReviewDays = useMemo(() => {
    return Array.from({ length: weekRangeDays }, (_, index) => shiftDate(new Date(), -index)).map((day) => {
      const key = calendarDayKey(day);
      const daySessions = sortedSessions.filter((session) => calendarDayKey(session.completedAt) === key);
      const exerciseIds = Array.from(new Set(daySessions.flatMap((session) => session.exercises.map((item) => item.exerciseId))));
      const exercises = exerciseIds
        .map((id) => {
          const meta = exerciseCatalog.find((item) => item.id === id);
          if (!meta) return null;
          if (weekMuscleFilter !== "All" && muscleGroupFor(meta.primaryMuscle) !== weekMuscleFilter) return null;
          const setCount = daySessions.reduce((sum, session) => {
            const match = session.exercises.find((item) => item.exerciseId === id);
            return sum + (match?.sets.length ?? 0);
          }, 0);
          return { id, name: meta.name, setCount, muscle: meta.primaryMuscle };
        })
        .filter((item): item is { id: string; name: string; setCount: number; muscle: string } => item !== null);
      return {
        key,
        day,
        exercises,
        volume: daySessions.reduce((sum, session) => sum + workoutVolume(session.exercises), 0),
      };
    }).filter((entry) => !weekOnlyTrained || entry.exercises.length > 0);
  }, [sortedSessions, exerciseCatalog, weekRangeDays, weekMuscleFilter, weekOnlyTrained]);
  // Current streak: walking back from today, a day counts if trained; a gap of 3+
  // consecutive untrained days ends the streak, shorter gaps are forgiven.
  const currentStreak = useMemo(() => {
    let trainedCount = 0;
    let gapRun = 0;
    let cursor = new Date();
    for (let i = 0; i < 400; i += 1) {
      if (sessionDayKeys.has(calendarDayKey(cursor))) {
        trainedCount += 1;
        gapRun = 0;
      } else {
        gapRun += 1;
        if (gapRun >= 3) break;
      }
      cursor = shiftDate(cursor, -1);
    }
    return trainedCount;
  }, [sessionDayKeys]);
  // Today first, then the 5 days before it — matches the streak row's reading order in RTL.
  const streakDayChips = useMemo(
    () => Array.from({ length: 6 }, (_, index) => shiftDate(new Date(), -index)).map((day) => ({
      key: calendarDayKey(day),
      day,
      trained: sessionDayKeys.has(calendarDayKey(day)),
      today: isToday(day.toISOString()),
    })),
    [sessionDayKeys],
  );
  const totalLoggedReps = useMemo(
    () => data.sessions.reduce((sum, session) => sum + countLoggedReps(session.exercises), 0),
    [data.sessions],
  );
  const personalRecords = useMemo(() => {
    const records = new Map<string, { weightKg: number; reps: number; date: string }>();
    data.sessions.forEach((session) => session.exercises.forEach((exercise) => exercise.sets.forEach((set) => {
      if (set.type !== "working") return;
      const current = records.get(exercise.exerciseId);
      if (!current || set.weightKg > current.weightKg) {
        records.set(exercise.exerciseId, { weightKg: set.weightKg, reps: set.reps, date: session.completedAt });
      }
    })));
    return Array.from(records.entries())
      .map(([exerciseId, record]) => ({
        exerciseId,
        ...record,
        name: exerciseCatalog.find((exercise) => exercise.id === exerciseId)?.name ?? "",
      }))
      .filter((record) => record.name)
      .sort((a, b) => b.weightKg - a.weightKg)
      .slice(0, 5);
  }, [data.sessions, exerciseCatalog]);
  // The picker doubles as a history sheet: each row carries how much work that
  // exercise already has behind it, so past exercises stay readable while
  // picking the next one instead of only the one being logged.
  const exerciseStatsById = useMemo(() => {
    const stats = new Map<string, { sessions: number; reps: number; lastDate: string; lastWeightKg: number; lastReps: number }>();
    sortedSessions.forEach((session) => session.exercises.forEach((logged) => {
      const working = logged.sets.filter((set) => set.type === "working");
      const sets = working.length ? working : logged.sets;
      if (!sets.length) return;
      const reps = sets.reduce((total, set) => total + set.reps, 0);
      const current = stats.get(logged.exerciseId);
      if (current) {
        current.sessions += 1;
        current.reps += reps;
        return;
      }
      // sortedSessions is newest first, so the first hit is the latest session.
      const heaviest = sets.reduce((best, set) => (set.weightKg > best.weightKg ? set : best), sets[0]);
      stats.set(logged.exerciseId, { sessions: 1, reps, lastDate: session.completedAt, lastWeightKg: heaviest.weightKg, lastReps: heaviest.reps });
    }));
    return stats;
  }, [sortedSessions]);
  const exercisesInSelectedGroup = useMemo(
    () => {
      const query = exerciseSearch.trim().toLocaleLowerCase("en");
      return exerciseCatalog.filter((exercise) =>
        (selectedMuscleGroup === "All" || muscleGroupFor(exercise.primaryMuscle) === selectedMuscleGroup)
        && (!query || exercise.name.toLocaleLowerCase("en").includes(query)),
      );
    },
    [exerciseCatalog, exerciseSearch, selectedMuscleGroup],
  );
  const filteredEquipment = useMemo(() => {
    const query = equipmentSearch.trim().toLocaleLowerCase();
    return data.equipment.filter((equipment) => {
      const matchesGroup = equipmentMuscleGroup === "All" || muscleGroupFor(equipment.primaryMuscle) === equipmentMuscleGroup;
      const matchesSearch = !query || `${equipment.name} ${equipment.type} ${equipment.notes ?? ""}`.toLocaleLowerCase().includes(query);
      return matchesGroup && matchesSearch;
    });
  }, [data.equipment, equipmentMuscleGroup, equipmentSearch]);
  const exerciseDraftMeta = exerciseCatalog.find((exercise) => exercise.id === exerciseToAdd);
  const draftAlreadyLogged = data.activeWorkout?.exercises.some((item) => item.exerciseId === exerciseToAdd) ?? false;
  const getExerciseHistory = (exerciseId: string, before?: { id: string; date: string }) => sortedSessions.flatMap((session) => {
    if (isAtOrAfter(session, before)) return [];
    const logged = session.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!logged?.sets.length) return [];
    const workingSets = logged.sets.filter((set) => set.type === "working");
    const sets = workingSets.length ? workingSets : logged.sets;
    const reps = sets.map((set) => set.reps);
    return [{
      id: session.id,
      date: session.completedAt,
      setCount: sets.length,
      repLabel: Math.min(...reps) === Math.max(...reps) ? String(reps[0]) : `${Math.min(...reps)}–${Math.max(...reps)}`,
      maxWeight: Math.max(...sets.map((set) => set.weightKg)),
    }];
  }).slice(0, 4);
  // The session being logged is already reconciled into data.sessions, so anything
  // that should read as "before today" has to skip it by id — otherwise the card
  // just mirrors the set that was entered a moment ago.
  const getExercisePersonalBest = (exerciseId: string, before?: { id: string; date: string }) => {
    let best: SetLog | undefined;
    data.sessions.forEach((session) => session.exercises.forEach((exercise) => {
      if (exercise.exerciseId !== exerciseId || isAtOrAfter(session, before)) return;
      exercise.sets.forEach((set) => {
        if (set.type === "working" && (!best || set.weightKg > best.weightKg)) best = set;
      });
    }));
    return best;
  };
  const exerciseHistory = getExerciseHistory(exerciseToAdd);
  const exercisePersonalBest = getExercisePersonalBest(exerciseToAdd);
  const daysSinceLastTrained = exerciseHistory.length ? daysSince(exerciseHistory[0].date) : null;
  // Everything framed as "before this session" measures against the session on screen.
  const sessionCutoff = data.activeWorkout
    ? { id: data.activeWorkout.id, date: selectedWorkoutDaySessions.find((session) => session.id === data.activeWorkout?.id)?.completedAt ?? data.activeWorkout.startedAt }
    : undefined;
  const activeSetCount = data.activeWorkout ? countLoggedSets(data.activeWorkout.exercises) : 0;
  const activeRepCount = data.activeWorkout ? countLoggedReps(data.activeWorkout.exercises) : 0;
  const activeVolume = data.activeWorkout ? workoutVolume(data.activeWorkout.exercises) : 0;
  // How many of the selected day's exercises beat their own pre-session best.
  const activeRecordCount = data.activeWorkout
    ? data.activeWorkout.exercises.filter((item) => {
        const heaviest = item.sets.filter((set) => set.type === "working").reduce((best, set) => Math.max(best, set.weightKg), 0);
        if (!heaviest) return false;
        const previousBest = getExercisePersonalBest(item.exerciseId, sessionCutoff);
        return !previousBest || heaviest > previousBest.weightKg;
      }).length
    : 0;
  // Volume change against the most recent session before the selected day.
  const previousSessionVolume = (() => {
    const earlier = sortedSessions.find((session) => !isAtOrAfter(session, sessionCutoff) && countLoggedSets(session.exercises) > 0);
    return earlier ? workoutVolume(earlier.exercises) : 0;
  })();
  const volumeDelta = previousSessionVolume > 0 && activeVolume > 0
    ? Math.round(((activeVolume - previousSessionVolume) / previousSessionVolume) * 100)
    : null;
  const totalLoggedVolume = useMemo(
    () => data.sessions.reduce((total, session) => total + workoutVolume(session.exercises), 0),
    [data.sessions],
  );
  const latestPerformanceFor = (exerciseId: string, before?: { id: string; date: string }) => {
    for (const session of sortedSessions) {
      if (isAtOrAfter(session, before)) continue;
      const sets = session.exercises.find((item) => item.exerciseId === exerciseId)?.sets ?? [];
      const found = [...sets].reverse().find((set) => set.type === "working");
      if (found) return { set: found, date: session.completedAt };
    }
    return undefined;
  };
  const latestSetFor = (exerciseId: string) => latestPerformanceFor(exerciseId)?.set;

  const startWorkout = (template?: Template) => {
    const base: ActiveWorkout = data.activeWorkout ?? {
      id: uid(),
      name: template?.name || "تمرين جديد",
      startedAt: dateOnSelectedDay(selectedWorkoutDate),
      exercises: [],
    };
    const newExerciseIds = (template?.exerciseIds || []).filter(
      (exerciseId) => !base.exercises.some((item) => item.exerciseId === exerciseId),
    );
    const activeWorkout: ActiveWorkout = {
      ...base,
      exercises: [...base.exercises, ...newExerciseIds.map((exerciseId) => ({ exerciseId, sets: [] }))],
    };
    persist({ ...data, activeWorkout });
    setSelectedExerciseId(activeWorkout.exercises[0]?.exerciseId || "");
    setTab("workout");
    if (activeWorkout.exercises.length === 0) setSheet("exercise");
  };

  const deleteEquipment = (id: string) => {
    const previous = data;
    const removedExerciseIds = data.exercises.filter((item) => item.equipmentId === id).map((item) => item.id);
    persist({
      ...data,
      equipment: data.equipment.filter((item) => item.id !== id),
      exercises: data.exercises.filter((item) => item.equipmentId !== id),
      templates: data.templates.map((template) => ({
        ...template,
        exerciseIds: template.exerciseIds.filter((exerciseId) => !removedExerciseIds.includes(exerciseId)),
      })),
      activeWorkout: data.activeWorkout
        ? { ...data.activeWorkout, exercises: data.activeWorkout.exercises.filter((item) => !removedExerciseIds.includes(item.exerciseId)) }
        : null,
    });
    showToast("تم حذف الجهاز", () => persist(previous));
  };

  const deleteTemplate = (id: string) => {
    const previous = data;
    persist({ ...data, templates: data.templates.filter((template) => template.id !== id) });
    showToast("تم حذف الجدول", () => persist(previous));
  };

  const deleteMeal = (id: string) => {
    const previous = data;
    persist({ ...data, meals: data.meals.filter((meal) => meal.id !== id) });
    showToast("تم حذف الوجبة", () => persist(previous));
  };

  const deleteSession = (id: string) => {
    const previous = data;
    persist({ ...data, sessions: data.sessions.filter((session) => session.id !== id) });
    showToast("تم حذف الحصة", () => persist(previous));
  };

  const removeExerciseFromWorkout = (exerciseId: string) => {
    if (!data.activeWorkout) return;
    const previous = data;
    const remainingExercises = data.activeWorkout.exercises.filter((item) => item.exerciseId !== exerciseId);
    persist({ ...data, activeWorkout: { ...data.activeWorkout, exercises: remainingExercises } });
    if (selectedExerciseId === exerciseId) setSelectedExerciseId(remainingExercises[0]?.exerciseId ?? "");
    showToast("تم إزالة التمرين من الحصة", () => persist(previous));
  };

  const logout = () => {
    localStorage.removeItem("rest-session");
    setSignedIn(false);
    setTab("workout");
    setWorkoutView("templates");
    setUsername("");
    setPassword("");
    setShowPassword(false);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (loginPending) return;
    setLoginError("");
    setLoginPending(true);
    try {
      const result = await authenticateOwner(username, password);
      if (!result.ok) {
        setLoginError(result.message);
        return;
      }
      localStorage.setItem("rest-session", "active");
      setSignedIn(true);
    } catch {
      setLoginError("تعذر تسجيل الدخول. أعد المحاولة.");
    } finally {
      setLoginPending(false);
    }
  };

  const closeEquipmentSheet = () => {
    setEditingEquipmentId(null);
    setEquipmentForm({ name: "", primaryMuscle: "", type: "آلة", exerciseName: "", notes: "", photos: [] });
    setSheet(null);
  };

  const openTemplateSheet = () => {
    setTemplateName("");
    setTemplateExercises([]);
    setSheet("template");
  };

  const openEquipmentSheet = (equipment?: Equipment) => {
    if (equipment) {
      setEditingEquipmentId(equipment.id);
      setEquipmentForm({
        name: equipment.name,
        primaryMuscle: equipment.primaryMuscle,
        type: equipment.type,
        exerciseName: "",
        notes: equipment.notes ?? "",
        photos: equipment.photos ?? [],
      });
    } else {
      setEditingEquipmentId(null);
      setEquipmentForm({ name: "", primaryMuscle: "", type: "آلة", exerciseName: "", notes: "", photos: [] });
    }
    setSheet("equipment");
  };

  const saveEquipment = (event: FormEvent) => {
    event.preventDefault();
    if (!equipmentForm.name.trim() || !equipmentForm.primaryMuscle) return;
    if (editingEquipmentId) {
      const previousEquipment = data.equipment.find((item) => item.id === editingEquipmentId);
      const updatedEquipment: Equipment[] = data.equipment.map((item) => item.id === editingEquipmentId
        ? {
            ...item,
            name: equipmentForm.name.trim(),
            primaryMuscle: equipmentForm.primaryMuscle,
            type: equipmentForm.type,
            photos: equipmentForm.photos.length ? equipmentForm.photos : undefined,
            notes: equipmentForm.notes.trim() || undefined,
          }
        : item);
      persist(withEquipmentExercises({
        ...data,
        equipment: updatedEquipment,
        // An exercise that still carries the old machine name was auto-created from it, so it follows the rename.
        exercises: data.exercises.map((exercise) => exercise.equipmentId === editingEquipmentId && exercise.name === previousEquipment?.name
          ? { ...exercise, name: equipmentForm.name.trim(), primaryMuscle: equipmentForm.primaryMuscle }
          : exercise),
      }));
      closeEquipmentSheet();
      showToast("تم تحديث الجهاز");
      return;
    }
    const equipment: Equipment = {
      id: uid(),
      name: equipmentForm.name.trim(),
      primaryMuscle: equipmentForm.primaryMuscle,
      type: equipmentForm.type,
      photos: equipmentForm.photos.length ? equipmentForm.photos : undefined,
      notes: equipmentForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const exercise = exerciseForEquipment(equipment, equipmentForm.exerciseName);
    persist({
      ...data,
      equipment: [equipment, ...data.equipment],
      exercises: [exercise, ...data.exercises],
    });
    closeEquipmentSheet();
    showToast("تم حفظ الجهاز والتمرين");
  };

  const saveTemplate = (event: FormEvent) => {
    event.preventDefault();
    if (!templateName.trim()) return;
    const template: Template = {
      id: uid(),
      name: templateName.trim(),
      exerciseIds: templateExercises,
      createdAt: new Date().toISOString(),
    };
    persist({ ...data, templates: [template, ...data.templates] });
    setTemplateName("");
    setTemplateExercises([]);
    setSheet(null);
    showToast("تم إنشاء الجدول");
  };

  const resetExerciseLogger = () => {
    setExerciseToAdd("");
    setExerciseDraftSets([]);
    setExerciseNotes("");
    setShowExerciseNotes(false);
    setDraftSetType("working");
    setDraftRir("2");
  };

  const selectExerciseForLogging = (exerciseId: string) => {
    const previous = latestSetFor(exerciseId);
    setExerciseToAdd(exerciseId);
    setExerciseDraftSets([{
      id: uid(),
      weightKg: String(previous?.weightKg ?? 0),
      reps: String(previous?.reps ?? 8),
    }]);
    setExerciseNotes("");
    setShowExerciseNotes(false);
  };

  // The single logging entry point: opens the sheet on the picker, or straight on
  // an exercise when one of the day's cards was tapped.
  const openExerciseSheet = (exerciseId?: string) => {
    resetExerciseLogger();
    setExerciseSearch("");
    if (!data.activeWorkout) startWorkout();
    if (exerciseId) selectExerciseForLogging(exerciseId);
    setSheet("exercise");
  };

  const updateExerciseDraftSet = (id: string, field: "weightKg" | "reps", value: string) => {
    setExerciseDraftSets((sets) => sets.map((set) => set.id === id ? { ...set, [field]: value } : set));
  };

  const stepExerciseDraftSet = (id: string, field: "weightKg" | "reps", amount: number) => {
    setExerciseDraftSets((sets) => sets.map((set) => {
      if (set.id !== id) return set;
      const current = Number(set[field]) || 0;
      const minimum = field === "reps" ? 1 : 0;
      return { ...set, [field]: String(Math.max(minimum, current + amount)) };
    }));
  };

  const addExerciseDraftSet = () => {
    const previous = exerciseDraftSets.at(-1);
    setExerciseDraftSets((sets) => [...sets, {
      id: uid(),
      weightKg: previous?.weightKg ?? "0",
      reps: previous?.reps ?? "8",
    }]);
  };

  const removeExerciseDraftSet = (id: string) => {
    setExerciseDraftSets((sets) => sets.length === 1 ? sets : sets.filter((set) => set.id !== id));
  };

  const saveExerciseDraft = (closeAfterSave: boolean) => {
    if (!data.activeWorkout || !exerciseToAdd || !exerciseDraftMeta) return;
    const now = new Date().toISOString();
    const sets: SetLog[] = exerciseDraftSets.flatMap((draft) => {
      const weightKg = readNumericInput(draft.weightKg);
      const reps = readNumericInput(draft.reps);
      if (weightKg === null || reps === null || weightKg < 0 || reps < 1) return [];
      return [{ id: uid(), weightKg, reps, rir: Number(draftRir), type: draftSetType, completedAt: now }];
    });
    if (!sets.length) {
      showToast("أدخل الوزن والتكرارات أولًا");
      return;
    }
    // Re-logging an exercise that is already in the day appends to it rather than
    // creating a duplicate entry, so a card can be reopened to add more sets.
    const alreadyLogged = data.activeWorkout.exercises.some((item) => item.exerciseId === exerciseToAdd);
    const notes = exerciseNotes.trim() || undefined;
    const nextActive: ActiveWorkout = {
      ...data.activeWorkout,
      exercises: alreadyLogged
        ? data.activeWorkout.exercises.map((item) => item.exerciseId === exerciseToAdd
          ? { ...item, sets: [...item.sets, ...sets], notes: notes ?? item.notes }
          : item)
        : [...data.activeWorkout.exercises, { exerciseId: exerciseToAdd, sets, notes }],
    };
    const nextExercises = data.exercises.some((exercise) => exercise.id === exerciseDraftMeta.id)
      ? data.exercises
      : [exerciseDraftMeta, ...data.exercises];
    persist({ ...data, exercises: nextExercises, activeWorkout: nextActive });
    setSelectedExerciseId(exerciseToAdd);
    resetExerciseLogger();
    setExerciseSearch("");
    if (closeAfterSave) setSheet(null);

    // Only a working set can set a record — a heavy warm-up should not celebrate.
    const heaviest = sets.filter((set) => set.type === "working").reduce((best, set) => Math.max(best, set.weightKg), 0);
    const previousBest = getExercisePersonalBest(exerciseToAdd, sessionCutoff);
    if (heaviest > 0 && (!previousBest || heaviest > previousBest.weightKg)) {
      showToast(`رقم قياسي جديد — ${formatNumber(heaviest)} كغ`, undefined, "record");
    } else {
      showToast(closeAfterSave ? "تم حفظ التمرين وجلساته" : "تم الحفظ — اختر التمرين التالي");
    }
  };

  const closeMealSheet = () => {
    setEditingMealId(null);
    setMealForm({ name: "", category: "فطور", calories: "", protein: "", carbs: "", fat: "" });
    setMealError("");
    setSheet(null);
  };

  const openMealSheet = (meal?: Meal) => {
    if (meal) {
      setEditingMealId(meal.id);
      setMealForm({
        name: meal.name,
        category: meal.category,
        calories: String(meal.calories),
        protein: meal.protein ? String(meal.protein) : "",
        carbs: meal.carbs ? String(meal.carbs) : "",
        fat: meal.fat ? String(meal.fat) : "",
      });
    } else {
      setEditingMealId(null);
      setMealForm({ name: "", category: "فطور", calories: "", protein: "", carbs: "", fat: "" });
    }
    setMealError("");
    setSheet("meal");
  };

  const saveMeal = (event: FormEvent) => {
    event.preventDefault();
    const calories = readNumericInput(mealForm.calories);
    const protein = readNumericInput(mealForm.protein) ?? 0;
    const carbs = readNumericInput(mealForm.carbs) ?? 0;
    const fat = readNumericInput(mealForm.fat) ?? 0;
    if (!mealForm.name.trim()) {
      setMealError("اكتب اسم الوجبة أولًا.");
      return;
    }
    if (calories === null || calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
      setMealError("أدخل السعرات بأرقام صحيحة. يمكنك استخدام 100 أو ١٠٠.");
      return;
    }
    if (editingMealId) {
      persist({
        ...data,
        meals: data.meals.map((meal) => meal.id === editingMealId
          ? { ...meal, name: mealForm.name.trim(), category: mealForm.category, calories, protein, carbs, fat }
          : meal),
      });
      closeMealSheet();
      showToast("تم تحديث الوجبة");
      return;
    }
    const meal: Meal = {
      id: uid(),
      name: mealForm.name.trim(),
      category: mealForm.category,
      calories,
      protein,
      carbs,
      fat,
      // Meals land on whichever day the Nutrition tab is showing.
      createdAt: dateOnSelectedDay(selectedMealDate),
    };
    persist({ ...data, meals: [meal, ...data.meals] });
    closeMealSheet();
    showToast("تمت إضافة الوجبة");
  };

  const saveTarget = (event: FormEvent) => {
    event.preventDefault();
    const nutritionTarget: NutritionTarget = {
      calories: readNumericInput(targetForm.calories) ?? 0,
      protein: readNumericInput(targetForm.protein) ?? 0,
      carbs: readNumericInput(targetForm.carbs) ?? 0,
      fat: readNumericInput(targetForm.fat) ?? 0,
    };
    persist({ ...data, nutritionTarget });
    setSheet(null);
    showToast("تم تحديث أهداف التغذية");
  };

  const openTargetSheet = () => {
    setTargetForm({
      calories: data.nutritionTarget.calories ? String(data.nutritionTarget.calories) : "",
      protein: data.nutritionTarget.protein ? String(data.nutritionTarget.protein) : "",
      carbs: data.nutritionTarget.carbs ? String(data.nutritionTarget.carbs) : "",
      fat: data.nutritionTarget.fat ? String(data.nutritionTarget.fat) : "",
    });
    setSheet("target");
  };

  // A sheet should behave like a real dialog: keep the page behind it still and
  // let keyboard users dismiss it without hunting for the close button.
  useEffect(() => {
    if (!sheet) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (sheet === "equipment") closeEquipmentSheet();
      else if (sheet === "meal") closeMealSheet();
      else if (sheet === "exercise") {
        resetExerciseLogger();
        setExerciseSearch("");
        setSheet(null);
      } else {
        setSheet(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sheet]);

  if (!loaded) {
    return (
      <main className="loading-page" aria-live="polite">
        <Logo />
        <LoaderCircle className="spin" size={24} />
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="login-page">
        <div className="login-aurora aurora-one" />
        <div className="login-aurora aurora-two" />
        <section className="login-card" aria-labelledby="login-title">
          <Logo />
          <div className="login-copy">
            <p className="eyebrow">مساحتك الخاصة للتدريب</p>
            <h1 id="login-title">تمرّن. سجّل. تحسّن.</h1>
            <p>كل ما تحتاجه في ناديك ووجباتك اليومية، في مكان واحد هادئ وواضح.</p>
          </div>
          <form className="form-stack" onSubmit={handleLogin}>
            <label>
              <span>اسم المستخدم</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="اسم المستخدم" />
            </label>
            <label>
              <span>كلمة المرور</span>
              <div className="password-field">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  inputMode="numeric"
                  placeholder="•••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <AppButton type="submit" disabled={loginPending} icon={loginPending ? <LoaderCircle className="spin" size={18} /> : <ArrowLeft size={18} />}>
              {loginPending ? "جارٍ الدخول…" : "دخول إلى رست"}
            </AppButton>
          </form>
          <p className="local-note"><LockKeyhole size={14} /> وضع محلي · بياناتك محفوظة على جهازك فقط</p>
        </section>
      </main>
    );
  }

  const calorieBand = progressBand(nutrition.calories, data.nutritionTarget.calories);

  const workoutContent = (
    <>
      <header className="page-header">
        <div>
          <h1>جدول التمرين</h1>
          <p>تابع تمارينك اليومية وسجّل أداءك</p>
        </div>
        <button
          className="page-header-action"
          onClick={() => setWorkoutView(workoutView === "equipment" ? "templates" : "equipment")}
          aria-label={workoutView === "equipment" ? "العودة للتمرين" : "إدارة المعدات"}
        >
          {workoutView === "equipment" ? <ChevronLeft size={16} /> : <Settings2 size={16} />}
          <span>{workoutView === "equipment" ? "التمرين" : "المعدات"}</span>
        </button>
      </header>

      {workoutView === "templates" && (
        <>
          <DaySelector
            selectedDay={selectedWorkoutDate}
            onSelect={selectWorkoutDate}
            countFor={(day) => sortedSessions.filter((session) => calendarDayKey(session.completedAt) === calendarDayKey(day)).length}
            label="اختيار يوم التمرين"
          />

          <p className="day-section-label">
            تمارين يوم {formatDayHeading(selectedWorkoutDate.toISOString())}
          </p>

          <section className="session-stats" aria-label="ملخص الحصة">
            <div className="session-stats-figures">
              <div>
                <span>أرقام قياسية</span>
                <b>{formatNumber(activeRecordCount)}</b>
              </div>
              <div>
                <span>المجموعات</span>
                <b>{formatNumber(activeSetCount)}</b>
              </div>
              <div>
                <span>الحجم</span>
                <b>{formatNumber(activeVolume)}<small>كغ</small></b>
              </div>
            </div>
            <div className="session-stats-meta">
              <span><b>{formatNumber(activeRepCount)}</b> تكرار</span>
              <span>
                <Dumbbell size={14} />
                <b>{formatNumber(data.activeWorkout?.exercises.length ?? 0)}</b> تمرين
              </span>
              {volumeDelta !== null && (
                <span className={`delta${volumeDelta < 0 ? " down" : ""}`}>
                  {volumeDelta < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                  {formatNumber(Math.abs(volumeDelta))}%
                </span>
              )}
            </div>
          </section>

          <div className="session-actions">
            <button type="button" className="session-log-button" onClick={() => openExerciseSheet()}>
              <Plus size={18} /> سجّل تمرين
            </button>
            <button
              type="button"
              className={`session-timer${timerRunning ? " running" : ""}`}
              onClick={() => setTimerRunning((running) => !running)}
              aria-label={timerRunning ? "إيقاف المؤقّت" : "تشغيل المؤقّت"}
            >
              {timerRunning ? <Pause size={17} /> : <Play size={17} />}
              <span className="timer-value">{formatClock(timerSeconds)}</span>
            </button>
          </div>

          {data.activeWorkout && data.activeWorkout.exercises.length > 0 ? (
            <div className="exercise-summary-list">
              {data.activeWorkout.exercises.map((item) => {
                const exercise = exerciseCatalog.find((entry) => entry.id === item.exerciseId);
                if (!exercise) return null;
                const equipment = data.equipment.find((entry) => entry.id === exercise.equipmentId);
                const photo = equipment?.photos?.[0];
                const weights = item.sets.map((set) => set.weightKg);
                const reps = item.sets.map((set) => set.reps);
                const range = (values: number[]) => {
                  if (!values.length) return "—";
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  return min === max ? formatNumber(min) : `${formatNumber(min)}-${formatNumber(max)}`;
                };
                return (
                  <button
                    type="button"
                    className="exercise-summary"
                    key={item.exerciseId}
                    onClick={() => openExerciseSheet(exercise.id)}
                    aria-label={`تعديل ${exercise.name}`}
                  >
                    <span className="exercise-summary-icon">
                      {photo ? <img src={photo} alt="" /> : <Dumbbell size={24} />}
                    </span>
                    <span className="exercise-summary-title">
                      <strong>{exercise.name}</strong>
                      <small>{muscleGroupLabel(exercise.primaryMuscle)}</small>
                    </span>
                    <span className="exercise-summary-figures">
                      <div><span>مجموعات</span><b>{formatNumber(item.sets.length)}</b></div>
                      <div><span>تكرارات</span><b dir="ltr">{range(reps)}</b></div>
                      <div><span>وزن</span><b dir="ltr">{range(weights)} <small>كغ</small></b></div>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Dumbbell size={26} />}
              title="لا يوجد تمرين في هذا اليوم"
              body="اختر تمرينك وسجّل مجموعاتك — يبدأ سجلك من هنا."
              action={<AppButton onClick={() => openExerciseSheet()} icon={<Plus size={18} />}>سجّل تمرين</AppButton>}
            />
          )}

          {otherSessionsForDay.length > 0 && (
            <section className="section-block">
              <div className="section-title"><div><h2>حصص أخرى في هذا اليوم</h2></div></div>
              {otherSessionsForDay.map((session) => (
                <article className="workout-history-card" key={session.id}>
                  <div className="workout-history-title">
                    <div><h2>{session.name}</h2><p>{countLabel(session.exercises.length, "تمرين واحد", "تمارين")} · {countLabel(countLoggedSets(session.exercises), "مجموعة واحدة", "مجموعات")}</p></div>
                    <b>{formatNumber(workoutVolume(session.exercises))}<small> كغ</small></b>
                  </div>
                </article>
              ))}
            </section>
          )}

          {data.templates.length > 0 && !data.activeWorkout && (
            <section className="section-block">
              <div className="section-title">
                <div><h2>ابدأ من قالب</h2></div>
                <button className="text-action" onClick={openTemplateSheet}><Plus size={17} /> قالب جديد</button>
              </div>
              <div className="template-list">
                {data.templates.map((template) => (
                  <article className="template-card" key={template.id}>
                    <div className="template-symbol"><ClipboardList size={22} /></div>
                    <div><h2>{template.name}</h2><p>{template.exerciseIds.length ? `${template.exerciseIds.length} تمارين` : "جدول فارغ — أضف تمارينك متى شئت"}</p></div>
                    <button className="start-mini" onClick={() => startWorkout(template)} aria-label={`بدء ${template.name}`}><span>ابدأ</span><ArrowLeft size={18} /></button>
                    <button className="card-delete" onClick={() => deleteTemplate(template.id)} aria-label={`حذف ${template.name}`}><Trash2 size={18} /></button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {workoutView === "equipment" && (
        <section className="section-block">
          <div className="section-title">
            <div><p className="eyebrow">مكتبتك الشخصية</p><h2>الأجهزة</h2></div>
            <button className="text-action" onClick={() => openEquipmentSheet()}><Plus size={17} /> إضافة جهاز</button>
          </div>
          {data.equipment.length === 0 ? (
            <EmptyState icon={<Camera size={27} />} title="سجّل أول جهاز" body="صوّر الجهاز، اكتب اسمه، واختر العضلة الأساسية. البقية اختيارية." action={<AppButton onClick={() => openEquipmentSheet()} icon={<Camera size={18} />}>إضافة جهاز</AppButton>} />
          ) : (
            <>
              <label className="library-search" dir="ltr">
                <Search size={18} />
                <input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="ابحث في أجهزتك" aria-label="ابحث في أجهزتك" />
              </label>
              <div className="filter-rail" role="group" aria-label="المجموعات العضلية" dir="ltr">
                {(["All", ...MUSCLE_GROUPS] as const).map((group) => <button type="button" key={group} className={equipmentMuscleGroup === group ? "selected" : ""} onClick={() => setEquipmentMuscleGroup(group)}>{group === "All" ? "الكل" : MUSCLE_GROUP_LABELS[group]}</button>)}
              </div>
              {filteredEquipment.length === 0 ? (
                <div className="library-empty"><Search size={20} /><span>لا توجد أجهزة مطابقة</span></div>
              ) : (
                <div className="equipment-list">
                  {filteredEquipment.map((equipment) => (
                    <article className="equipment-card" key={equipment.id}>
                      <div className="equipment-image">
                        {equipment.photos?.length ? <img src={equipment.photos[0]} alt={`صورة ${equipment.name}`} /> : <Dumbbell size={26} />}
                        {equipment.photos && equipment.photos.length > 1 && <span className="equipment-photo-count">{equipment.photos.length}</span>}
                      </div>
                      <div><h2>{equipment.name}</h2><p>{muscleGroupLabel(equipment.primaryMuscle)} · {equipment.type}</p><span>{countLabel(data.exercises.filter((item) => item.equipmentId === equipment.id).length, "تمرين واحد مرتبط", "تمارين مرتبطة")}</span></div>
                      <button className="card-edit" onClick={() => openEquipmentSheet(equipment)} aria-label={`تعديل ${equipment.name}`}><Pencil size={17} /></button>
                      <button className="card-delete" onClick={() => deleteEquipment(equipment.id)} aria-label={`حذف ${equipment.name}`}><Trash2 size={18} /></button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

    </>
  );

  const nutritionContent = (
    <>
      <header className="page-header">
        <div>
          <h1>التغذية</h1>
          <p>تابع وجباتك اليومية والسعرات الحرارية</p>
        </div>
      </header>

      <DaySelector
        selectedDay={selectedMealDate}
        onSelect={setSelectedMealDate}
        countFor={(day) => data.meals.filter((meal) => calendarDayKey(meal.createdAt) === calendarDayKey(day)).length}
        label="اختيار يوم الوجبات"
      />

      <section className="nutrient-card calorie-card" aria-label="السعرات الحرارية">
        <div className="nutrient-head">
          <span className="nutrient-name"><span className="nutrient-emoji" aria-hidden="true">🔥</span> السعرات الحرارية</span>
          <button type="button" className="nutrient-goal" onClick={openTargetSheet}>
            <SlidersHorizontal size={14} /> الهدف
          </button>
        </div>
        <div
          className="nutrient-track"
          role="progressbar"
          aria-valuenow={calorieBand.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`السعرات: ${calorieBand.percent}% من الهدف`}
        >
          <span style={{ width: `${calorieBand.width}%` }} />
        </div>
        <p className="nutrient-value" dir="rtl">
          <b>{formatNumber(nutrition.calories)}</b>
          <span dir="ltr">/ {formatNumber(data.nutritionTarget.calories)} kcal</span>
        </p>
      </section>

      <div className="macro-grid">
        {([
          ["البروتين", "🍗", nutrition.protein, data.nutritionTarget.protein, "protein"],
          ["الدهون", "🥑", nutrition.fat, data.nutritionTarget.fat, "fat"],
          ["الكارب", "🌿", nutrition.carbs, data.nutritionTarget.carbs, "carbs"],
        ] as const).map(([label, emoji, current, target, macro]) => {
          const band = progressBand(current, target);
          return (
            <article className={`nutrient-card ${macro}`} key={label}>
              <div className="nutrient-head">
                <span className="nutrient-name"><span className="nutrient-emoji" aria-hidden="true">{emoji}</span> {label}</span>
              </div>
              <div
                className="nutrient-track"
                role="progressbar"
                aria-valuenow={band.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${band.percent}% من الهدف`}
              >
                <span style={{ width: `${band.width}%` }} />
              </div>
              <p className="nutrient-value" dir="rtl">
                <b>{formatNumber(current)}</b>
                <span dir="ltr">/ {formatNumber(target)} g</span>
              </p>
            </article>
          );
        })}
      </div>

      <section className="section-block">
        <div className="section-title">
          <div><h2>وجبات {isToday(selectedMealDate.toISOString()) ? "اليوم" : formatDate(selectedMealDate.toISOString())}</h2></div>
          <button className="meal-add-button" onClick={() => openMealSheet()}><Plus size={16} /> إضافة وجبة</button>
        </div>
        {selectedDayMeals.length === 0 ? (
          <div className="meals-empty">
            <Utensils size={40} strokeWidth={1.5} />
            <p>لا توجد وجبات مسجلة</p>
          </div>
        ) : (
          <div className="meal-list">
            {selectedDayMeals.map((meal) => (
              <article className="meal-card" key={meal.id}>
                <div className="meal-icon"><Utensils size={19} /></div>
                <div>
                  <p>{meal.category} · {formatTime(meal.createdAt)}</p>
                  <h2>{meal.name}</h2>
                  <span>{formatNumber(meal.protein)} ب · {formatNumber(meal.carbs)} ك · {formatNumber(meal.fat)} د</span>
                </div>
                <strong>{formatNumber(meal.calories)}<small> kcal</small></strong>
                <button className="card-edit" onClick={() => openMealSheet(meal)} aria-label={`تعديل ${meal.name}`}><Pencil size={16} /></button>
                <button className="card-delete" onClick={() => deleteMeal(meal.id)} aria-label={`حذف ${meal.name}`}><Trash2 size={18} /></button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const progressContent = (
    <>
      <header className="page-header">
        <div>
          <h1>التقدم</h1>
          <p>تابع تقدمك وسلسلة أيامك المتتالية</p>
        </div>
      </header>

      <div className="progress-stats">
        <article className="progress-stat-card">
          <span className="progress-stat-icon" style={{ color: "var(--violet)" }}><Dumbbell size={15} /></span>
          <strong dir="ltr">{formatNumber(totalLoggedVolume)}</strong>
          <span>الحجم (كجم)</span>
        </article>
        <article className="progress-stat-card">
          <span className="progress-stat-icon" style={{ color: "var(--accent)" }}><Activity size={15} /></span>
          <strong>{formatNumber(data.sessions.length)}</strong>
          <span>الجلسات</span>
        </article>
        <article className="progress-stat-card">
          <span className="progress-stat-icon" style={{ color: "var(--sand)" }}><Repeat size={15} /></span>
          <strong>{formatNumber(totalLoggedReps)}</strong>
          <span>العدات</span>
        </article>
      </div>

      <section className="streak-card" aria-label="سلسلة الأيام">
        <div className="streak-card-head">
          <span className="streak-card-title"><Flame size={14} /> سلسلة الأيام</span>
        </div>
        <div className="streak-body">
          <div className="streak-day-strip" role="group" aria-label="آخر ستة أيام">
            {streakDayChips.map(({ key, day, trained, today }) => (
              <div className={`streak-day${today ? " is-today" : ""}`} key={key}>
                <span>{today ? "اليوم" : ARABIC_WEEK_INITIALS[day.getDay()]}</span>
                <b>{day.getDate()}</b>
                {trained ? <Check size={11} /> : <i className="streak-day-empty" />}
              </div>
            ))}
          </div>
          <div className="streak-number">
            <strong>{formatNumber(currentStreak)}</strong>
            <span>أطول سلسلة أيام متتالية</span>
          </div>
        </div>
        <p className="streak-note"><Info size={11} /> تستمر السلسلة طالما لم تتوقف 3 أيام متتالية</p>
      </section>

      <section className="section-block week-review-block">
        <div className="week-review-head">
          <span className="week-review-label">السجل</span>
          <div className="week-review-controls">
            <button
              type="button"
              className={`week-control-btn${weekMuscleFilter !== "All" ? " active" : ""}`}
              onClick={() => { setWeekRangeMenuOpen(false); setWeekFilterMenuOpen((open) => !open); }}
              aria-expanded={weekFilterMenuOpen}
            >
              <Filter size={13} /> فلتر
            </button>
            <button
              type="button"
              className={`week-control-btn${weekOnlyTrained ? " active" : ""}`}
              onClick={() => setWeekOnlyTrained((only) => !only)}
              aria-pressed={weekOnlyTrained}
            >
              <Check size={13} /> أيام تمرين فقط
            </button>
            <button
              type="button"
              className="week-control-btn"
              onClick={() => { setWeekFilterMenuOpen(false); setWeekRangeMenuOpen((open) => !open); }}
              aria-expanded={weekRangeMenuOpen}
            >
              {weekRangeLabel(weekRangeDays)}
              {weekRangeMenuOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {weekFilterMenuOpen && (
          <div className="filter-rail week-filter-rail" role="group" aria-label="فلترة حسب العضلة">
            {(["All", ...MUSCLE_GROUPS] as const).map((group) => (
              <button type="button" key={group} className={weekMuscleFilter === group ? "selected" : ""} onClick={() => { setWeekMuscleFilter(group); setWeekFilterMenuOpen(false); }}>
                {group === "All" ? "الكل" : MUSCLE_GROUP_LABELS[group]}
              </button>
            ))}
          </div>
        )}
        {weekRangeMenuOpen && (
          <div className="filter-rail week-filter-rail" role="group" aria-label="نطاق الأيام">
            {([5, 7, 14, 30] as const).map((count) => (
              <button type="button" key={count} className={weekRangeDays === count ? "selected" : ""} onClick={() => { setWeekRangeDays(count); setWeekRangeMenuOpen(false); }}>
                {weekRangeLabel(count)}
              </button>
            ))}
          </div>
        )}

        <div className="week-review">
          {weekReviewDays.length === 0 && (
            <p className="week-review-empty">لا توجد أيام تمرين في هذا النطاق</p>
          )}
          {weekReviewDays.map(({ key, day, exercises, volume }) => {
            const today = isToday(day.toISOString());
            return (
              <div className={`week-row${today ? " is-today" : ""}`} key={key}>
                <div className="week-row-day">
                  <strong>{today ? "اليوم" : ARABIC_WEEK_DAYS[day.getDay()]}</strong>
                  <span>{day.getDate()} {LATIN_MONTHS[day.getMonth()]}</span>
                  {volume > 0 && <i className="week-row-dot" />}
                </div>
                <div className="week-row-body">
                  {exercises.length ? (
                    <div className="week-exercise-strip">
                      {exercises.map((exercise) => (
                        <div className="week-exercise-item" key={exercise.id}>
                          <span className="week-exercise-icon" style={{ color: `var(${muscleGroupColorVar(exercise.muscle)})` }}>
                            <Dumbbell size={16} />
                          </span>
                          <small>{exercise.name}</small>
                        </div>
                      ))}
                    </div>
                  ) : <span className="week-rest">راحة</span>}
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="expand-history-toggle" onClick={() => setFullHistoryExpanded((open) => !open)} aria-expanded={fullHistoryExpanded}>
          <span>{fullHistoryExpanded ? "إخفاء السجل الكامل" : "عرض السجل الكامل"}</span>
          {fullHistoryExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </section>

      {fullHistoryExpanded && (
        <>
          <section className="month-calendar" aria-label="اختيار تاريخ من السجل">
            <button
              type="button"
              className="calendar-trigger"
              onClick={() => setCalendarExpanded((current) => !current)}
              aria-expanded={calendarExpanded}
            >
              <span className="calendar-trigger-icon"><Calendar size={18} /></span>
              <span className="calendar-trigger-label">
                <strong>{isToday(selectedHistoryDate.toISOString()) ? "اليوم" : formatDayHeading(selectedHistoryDate.toISOString())}</strong>
                <small>{selectedDaySessions.length ? countLabel(selectedDaySessions.length, "حصة واحدة", "حصص") : "لا يوجد تمرين"}</small>
              </span>
              <ChevronDown className="calendar-trigger-chevron" size={19} />
            </button>

            {calendarExpanded && (
              <div className="month-calendar-body">
                <div className="month-calendar-head">
                  <button type="button" onClick={() => setHistoryDateOverride(shiftMonth(selectedHistoryDate, -1))} aria-label="الشهر السابق"><ChevronRight size={19} /></button>
                  <strong>{historyMonthLabel}</strong>
                  <button type="button" onClick={() => setHistoryDateOverride(shiftMonth(selectedHistoryDate, 1))} aria-label="الشهر التالي"><ChevronLeft size={19} /></button>
                  <button type="button" className="today-jump" onClick={() => { setHistoryDateOverride(new Date()); setExpandedSessionId(null); setCalendarExpanded(false); }}>اليوم</button>
                </div>

                <div className="month-weekdays" aria-hidden="true">
                  {ARABIC_WEEK_INITIALS.map((initial, index) => <span key={ARABIC_WEEK_DAYS[index]}>{initial}</span>)}
                </div>

                <div className="month-grid" role="group" aria-label="أيام الشهر">
                  {historyMonthCells.map((day, index) => {
                    if (!day) return <span className="month-blank" key={`blank-${index}`} />;
                    const key = calendarDayKey(day);
                    const selected = key === calendarDayKey(selectedHistoryDate);
                    const today = isToday(day.toISOString());
                    const trained = sessionDayKeys.has(key);
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`month-day${selected ? " selected" : ""}${today ? " today" : ""}${trained ? " trained" : ""}`}
                        onClick={() => { setHistoryDateOverride(day); setExpandedSessionId(null); setCalendarExpanded(false); }}
                        aria-pressed={selected}
                        aria-label={`${formatDayHeading(day.toISOString())}${trained ? " — يوم تمرين" : ""}`}
                      >
                        <b>{formatNumber(day.getDate())}</b>
                        <i />
                      </button>
                    );
                  })}
                </div>

                <div className="month-legend">
                  <span><i /> يوم تمرين</span>
                  <b>{countLabel(monthSessionCount, "حصة واحدة هذا الشهر", "حصص هذا الشهر")}</b>
                </div>
              </div>
            )}
          </section>

          <section className="day-log">
            <div className="day-log-head">
              <h2>{isToday(selectedHistoryDate.toISOString()) ? "اليوم" : formatDayHeading(selectedHistoryDate.toISOString())}</h2>
              {selectedDaySessions.length > 0 && <span>{countLabel(selectedDaySessions.length, "حصة واحدة", "حصص")}</span>}
            </div>

            {selectedDaySessions.length ? selectedDaySessions.map((session) => {
              const expanded = expandedSessionId === session.id;
              return (
                <article className={`log-card${expanded ? " expanded" : ""}`} key={session.id}>
                  <button
                    type="button"
                    className="log-card-head"
                    onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                    aria-expanded={expanded}
                  >
                    <span className="log-symbol"><Dumbbell size={19} /></span>
                    <span className="log-title">
                      <strong>{session.name}</strong>
                      <small>{formatTime(session.completedAt)} · {countLabel(session.exercises.length, "تمرين واحد", "تمارين")} · {countLabel(countLoggedSets(session.exercises), "مجموعة واحدة", "مجموعات")}</small>
                    </span>
                    <ChevronDown className="log-chevron" size={19} />
                  </button>

                  {expanded && (
                    <div className="log-body">
                      {session.exercises.map((exercise) => {
                        const meta = exerciseCatalog.find((item) => item.id === exercise.exerciseId);
                        let workingIndex = 0;
                        return (
                          <div className="log-exercise" key={exercise.exerciseId}>
                            <div className="log-exercise-head">
                              <strong>{meta?.name ?? "تمرين محذوف"}</strong>
                              <small>{countLabel(exercise.sets.length, "مجموعة واحدة", "مجموعات")}</small>
                            </div>
                            <div className="log-sets">
                              {exercise.sets.map((set) => {
                                if (set.type === "working") workingIndex += 1;
                                return (
                                  <span className={`log-set${set.type === "warmup" ? " warmup" : ""}`} key={set.id}>
                                    <i>{set.type === "warmup" ? "إحماء" : formatNumber(workingIndex)}</i>
                                    <b dir="ltr">{formatNumber(set.weightKg)} kg × {formatNumber(set.reps)}</b>
                                  </span>
                                );
                              })}
                            </div>
                            {exercise.notes && <p className="log-note">{exercise.notes}</p>}
                          </div>
                        );
                      })}
                      <div className="log-card-footer">
                        <span>حجم العمل <b dir="ltr">{formatNumber(workoutVolume(session.exercises))} kg</b></span>
                        <button type="button" onClick={() => deleteSession(session.id)}><Trash2 size={15} /> حذف الحصة</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            }) : (
              <div className="day-log-empty">
                <Dumbbell size={22} />
                <strong>لا يوجد تمرين في هذا اليوم</strong>
                <span>الأيام المعلّمة بنقطة فيها حصص مسجلة.</span>
              </div>
            )}
          </section>

          {personalRecords.length > 0 && (
            <section className="section-block">
              <div className="section-title"><div><p className="eyebrow">أفضل ما رفعت</p><h2>أرقامك القياسية</h2></div></div>
              <div className="record-list">
                {personalRecords.map((record, index) => (
                  <article className="record-row" key={record.exerciseId}>
                    <span className={`record-rank${index === 0 ? " top" : ""}`}>{index === 0 ? <Trophy size={15} /> : formatNumber(index + 1)}</span>
                    <div><strong>{record.name}</strong><small>{formatDate(record.date)}</small></div>
                    <b dir="ltr">{formatNumber(record.weightKg)} kg × {formatNumber(record.reps)}</b>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );

  const content = tab === "workout" ? workoutContent : tab === "nutrition" ? nutritionContent : progressContent;

  return (
    <main className="app-shell">
      <div className="app-top">
        <Logo />
        <div className="sync-indicator" data-status="local">
          <span className="sync-dot" /> محفوظ على جهازك
        </div>
        <button className="icon-button surface" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
      </div>
      <div className={`page-content view-${tab} view-${workoutView}${data.activeWorkout ? " workout-active" : ""}`}>{content}</div>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {NAVIGATION.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast.tone === "record" ? <Trophy size={17} /> : <Check size={17} />} {toast.text}
          {toastUndo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => { toastUndo(); setToastState(null); setToastUndo(null); }}
            >
              تراجع
            </button>
          )}
        </div>
      )}

      {sheet === "equipment" && (
        <Sheet title={editingEquipmentId ? "تعديل الجهاز" : "إضافة جهاز"} onClose={closeEquipmentSheet}>
          <form className="form-stack sheet-form equipment-form" onSubmit={saveEquipment}>
            <div className="photo-upload-field">
              <span>صور الجهاز <em>اختياري</em></span>
              <div className="photo-thumb-row" dir="ltr">
                {equipmentForm.photos.map((photo, index) => (
                  <div className="photo-thumb" key={index}>
                    <img src={photo} alt={`صورة ${index + 1} من الجهاز`} />
                    <button
                      type="button"
                      className="photo-thumb-remove"
                      onClick={() => setEquipmentForm((current) => ({ ...current, photos: current.photos.filter((_, i) => i !== index) }))}
                      aria-label={`حذف الصورة ${index + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <label className="photo-thumb-add">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        const dataUrl = await readFileAsCompressedPhoto(file);
                        setEquipmentForm((current) => ({ ...current, photos: [...current.photos, dataUrl] }));
                      }
                      event.target.value = "";
                    }}
                  />
                  <Camera size={22} />
                  <p>{equipmentForm.photos.length ? "إضافة" : "التقط صورة"}</p>
                </label>
              </div>
            </div>
            <label><span>اسم الجهاز <b>*</b></span><input value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} placeholder="مثال: جهاز ضغط الصدر" autoFocus /></label>
            <fieldset className="muscle-fieldset">
              <legend>المجموعة العضلية <b>*</b></legend>
              <div className="muscle-group-grid compact" role="group" aria-label="المجموعة العضلية" dir="ltr">
                {MUSCLE_GROUPS.map((muscle) => <button type="button" key={muscle} className={equipmentForm.primaryMuscle === muscle ? "selected" : ""} onClick={() => setEquipmentForm({ ...equipmentForm, primaryMuscle: muscle })} aria-pressed={equipmentForm.primaryMuscle === muscle}>{MUSCLE_GROUP_LABELS[muscle]}</button>)}
              </div>
            </fieldset>
            <label><span>نوع الجهاز</span><select value={equipmentForm.type} onChange={(event) => setEquipmentForm({ ...equipmentForm, type: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
            {!editingEquipmentId && (
              <label><span>اسم التمرين على الجهاز <em>اختياري</em></span><input value={equipmentForm.exerciseName} onChange={(event) => setEquipmentForm({ ...equipmentForm, exerciseName: event.target.value })} placeholder={equipmentForm.name.trim() || "مثال: ضغط صدر جالس"} /><small className="field-hint">اتركه فارغًا وسنستخدم اسم الجهاز، ليظهر مباشرة عند إضافة تمرين.</small></label>
            )}
            <label><span>ملاحظات <em>اختياري</em></span><textarea value={equipmentForm.notes} onChange={(event) => setEquipmentForm({ ...equipmentForm, notes: event.target.value })} placeholder="رقم المقعد، إعداد الجهاز، أو أي تلميح مهم" rows={3} /></label>
            <AppButton type="submit" disabled={!equipmentForm.name.trim() || !equipmentForm.primaryMuscle} icon={<Check size={18} />}>{editingEquipmentId ? "حفظ التعديلات" : "حفظ الجهاز"}</AppButton>
          </form>
        </Sheet>
      )}

      {sheet === "template" && <Sheet title="إنشاء جدولك" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTemplate}><label><span>اسم الجدول <b>*</b></span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="اكتب الاسم الذي يناسبك" autoFocus /></label><fieldset className="exercise-picker"><legend>اختر التمارين <em>اختياري</em></legend><p className="form-hint">اختر من التمارين الجاهزة أو تمارينك التي أضفتها. يمكنك تعديل القالب لاحقًا.</p>{exerciseCatalog.map((exercise) => <label key={exercise.id} className="check-row"><input type="checkbox" checked={templateExercises.includes(exercise.id)} onChange={(event) => setTemplateExercises(event.target.checked ? [...templateExercises, exercise.id] : templateExercises.filter((id) => id !== exercise.id))} /><span>{exercise.name}</span><small>{exercise.primaryMuscle}</small></label>)}</fieldset><AppButton type="submit" disabled={!templateName.trim()} icon={<Check size={18} />}>حفظ الجدول</AppButton></form></Sheet>}

      {sheet === "exercise" && (
        <Sheet title={`تسجيل تمرين · ${ARABIC_WEEK_DAYS[selectedWorkoutDate.getDay()]} ${selectedWorkoutDate.getDate()} ${LATIN_MONTHS[selectedWorkoutDate.getMonth()]}`} onClose={() => { resetExerciseLogger(); setExerciseSearch(""); setSheet(null); }}>
          <form className="exercise-session-form" onSubmit={(event) => { event.preventDefault(); saveExerciseDraft(true); }}>
            <div className="session-tool-row">
              <label className="library-search">
                <Search size={18} />
                <input value={exerciseSearch} onChange={(event) => { setExerciseSearch(event.target.value); if (exerciseToAdd) resetExerciseLogger(); }} placeholder="ابحث في معداتك..." aria-label="ابحث في معداتك" autoFocus={!exerciseDraftMeta} />
              </label>
              <button type="button" className="library-link compact-link" onClick={() => { resetExerciseLogger(); setExerciseSearch(""); setSheet(null); setWorkoutView("equipment"); }}><Dumbbell size={17} /><span>المكتبة</span></button>
            </div>

            {!exerciseDraftMeta ? (
              <>
                <div className="filter-rail exercise-filter" role="group" aria-label="المجموعات العضلية">
                  {(["All", ...MUSCLE_GROUPS] as const).map((group) => (
                    <button type="button" key={group} className={selectedMuscleGroup === group ? "selected" : ""} onClick={() => setSelectedMuscleGroup(group)} aria-pressed={selectedMuscleGroup === group}>
                      {group === "All" ? "الكل" : MUSCLE_GROUP_LABELS[group]}
                    </button>
                  ))}
                </div>
                {exercisesInSelectedGroup.length === 0 ? (
                  <div className="library-empty"><Search size={20} /><span>لا توجد تمارين مطابقة</span></div>
                ) : (
                  <div className="exercise-picker-list" role="listbox" aria-label="تمارينك">
                    {exercisesInSelectedGroup.map((exercise) => {
                      const stats = exerciseStatsById.get(exercise.id);
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          key={exercise.id}
                          onClick={() => selectExerciseForLogging(exercise.id)}
                        >
                          <strong>{exercise.name}</strong>
                          {stats && <span className="picker-last" dir="ltr">{formatNumber(stats.lastWeightKg)} kg × {formatNumber(stats.lastReps)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="exercise-logger">
                <div className="selected-exercise-row">
                  <div className="selected-exercise-strip">
                    <strong>{exerciseDraftMeta.name}</strong>
                    <button type="button" onClick={resetExerciseLogger} aria-label="إلغاء اختيار التمرين"><X size={17} /></button>
                  </div>
                  <div className="exercise-best">
                    <span>أقوى مستوى</span>
                    {exercisePersonalBest
                      ? <b dir="ltr">{formatNumber(exercisePersonalBest.reps)} × {formatNumber(exercisePersonalBest.weightKg)} kg</b>
                      : <small>لا يوجد سجل</small>}
                  </div>
                </div>

                <section className="exercise-history-card" aria-label="آخر أداء للتمرين">
                  <div className="history-title">
                    <span><History size={17} /> آخر التمارين</span>
                    <small>{daysSinceLastTrained !== null ? daysAgoLabel(daysSinceLastTrained) : "أول مرة"}</small>
                  </div>
                  {exerciseHistory.length ? (
                    <div className="history-table">
                      <div className="history-row history-head"><span>التاريخ</span><span>جلسات</span><span>عدات</span><span>وزن</span></div>
                      {(() => {
                        const bestWeight = Math.max(...exerciseHistory.map((entry) => entry.maxWeight));
                        return exerciseHistory.map((entry) => (
                          <div className={`history-row${entry.maxWeight === bestWeight ? " is-best" : ""}`} key={entry.id}>
                            <span className="history-date">
                              <strong>{ARABIC_WEEK_DAYS[new Date(entry.date).getDay()]}</strong>
                              <small>{formatDate(entry.date)}</small>
                            </span>
                            <b>{formatNumber(entry.setCount)}</b>
                            <b dir="ltr">{entry.repLabel}</b>
                            <b dir="ltr">{formatNumber(entry.maxWeight)}kg</b>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : <p className="history-empty">سجّل أول أداء لك، وسيظهر هنا في المرة القادمة.</p>}
                </section>

                <section className="draft-sets" aria-label="جلسات التمرين الحالية">
                  <div className="draft-set-head"><span>جلسات</span><span>التكرارات</span><span>الوزن</span></div>
                  {exerciseDraftSets.map((draft, index) => (
                    <div className="draft-set-row" key={draft.id}>
                      <div className="draft-index"><b>{formatNumber(index + 1)}</b>{exerciseDraftSets.length > 1 && <button type="button" onClick={() => removeExerciseDraftSet(draft.id)} aria-label={`حذف الجلسة ${index + 1}`}><X size={14} /></button>}</div>
                      <div className="stepper-control" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", -1)} aria-label="إنقاص التكرارات"><Minus size={16} /></button><input value={draft.reps} onChange={(event) => updateExerciseDraftSet(draft.id, "reps", event.target.value)} type="text" inputMode="numeric" aria-label={`تكرارات الجلسة ${index + 1}`} /><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", 1)} aria-label="زيادة التكرارات"><Plus size={16} /></button></div>
                      <div className="stepper-control weight-stepper" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", -0.5)} aria-label="إنقاص الوزن"><Minus size={16} /></button><input value={draft.weightKg} onChange={(event) => updateExerciseDraftSet(draft.id, "weightKg", event.target.value)} type="text" inputMode="decimal" aria-label={`وزن الجلسة ${index + 1}`} /><span>kg</span><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", 0.5)} aria-label="زيادة الوزن"><Plus size={16} /></button></div>
                    </div>
                  ))}
                  <button type="button" className="add-draft-set" onClick={addExerciseDraftSet}><Plus size={17} /> إضافة جلسة</button>
                </section>

                <div className="logger-extras-row">
                  <button type="button" className="notes-toggle" onClick={() => setShowExerciseNotes((visible) => !visible)}>
                    <Plus size={16} /> خيارات وملاحظات
                  </button>
                  {draftAlreadyLogged && (
                    <button
                      type="button"
                      className="remove-from-session"
                      onClick={() => { removeExerciseFromWorkout(exerciseToAdd); resetExerciseLogger(); setSheet(null); }}
                    >
                      <Trash2 size={15} /> إزالة من الحصة
                    </button>
                  )}
                </div>
                {showExerciseNotes && (
                  <div className="logger-extras">
                    <fieldset className="set-choice-block">
                      <legend>نوع الجلسة</legend>
                      <div className="set-type-segment" role="group" aria-label="نوع الجلسة">
                        <button type="button" className={draftSetType === "working" ? "selected" : ""} onClick={() => setDraftSetType("working")}>مجموعة عمل</button>
                        <button type="button" className={draftSetType === "warmup" ? "selected" : ""} onClick={() => setDraftSetType("warmup")}>إحماء</button>
                      </div>
                    </fieldset>
                    <fieldset className="set-choice-block rir-choice">
                      <legend><span>RIR</span><small>التكرارات المتبقية</small></legend>
                      <div className="rir-chip-row" role="group" aria-label="التكرارات المتبقية">
                        {[0, 1, 2, 3, 4, 5].map((rir) => (
                          <button type="button" key={rir} className={draftRir === String(rir) ? "selected" : ""} onClick={() => setDraftRir(String(rir))} aria-pressed={draftRir === String(rir)}>{rir}</button>
                        ))}
                      </div>
                    </fieldset>
                    <textarea className="exercise-notes" value={exerciseNotes} onChange={(event) => setExerciseNotes(event.target.value)} placeholder="اكتب ملاحظة عن الأداء أو إعداد الجهاز" rows={3} />
                  </div>
                )}

                <div className="exercise-save-actions">
                  <button type="submit" className="session-save">حفظ التمرين</button>
                  <button type="button" className="session-save-more" onClick={() => saveExerciseDraft(false)}><Plus size={17} /> إضافة آخر</button>
                </div>
              </div>
            )}
          </form>
        </Sheet>
      )}

      {sheet === "meal" && (
        <Sheet title={editingMealId ? "تعديل الوجبة" : "إضافة وجبة"} onClose={closeMealSheet}>
          <form className="meal-entry-sheet" onSubmit={saveMeal}>
            <label className="meal-name-field">
              <span>اسم الوجبة</span>
              <input value={mealForm.name} onChange={(event) => { setMealError(""); setMealForm({ ...mealForm, name: event.target.value }); }} placeholder="وش أكلت؟" autoFocus aria-label="اسم الوجبة" />
            </label>

            <fieldset className="meal-category-block">
              <legend>وقت الوجبة</legend>
              <div className="meal-category-rail" role="group" aria-label="تصنيف الوجبة">
                {MEAL_CATEGORIES.map((category) => <button type="button" key={category} className={mealForm.category === category ? "selected" : ""} onClick={() => setMealForm({ ...mealForm, category })} aria-pressed={mealForm.category === category}>{category}</button>)}
              </div>
            </fieldset>

            <label className="calorie-entry-card">
              <span><small>الطاقة</small>السعرات</span>
              <div dir="ltr"><input value={mealForm.calories} onChange={(event) => { setMealError(""); setMealForm({ ...mealForm, calories: event.target.value }); }} inputMode="decimal" min="0" placeholder="0" aria-label="السعرات" /><b>kcal</b></div>
            </label>

            <div className="macro-entry-grid" aria-label="الماكروز الاختيارية">
              <label className="protein"><span>بروتين</span><div dir="ltr"><input value={mealForm.protein} onChange={(event) => setMealForm({ ...mealForm, protein: event.target.value })} inputMode="decimal" min="0" placeholder="0" aria-label="البروتين" /><b>g</b></div></label>
              <label className="carbs"><span>كربوهيدرات</span><div dir="ltr"><input value={mealForm.carbs} onChange={(event) => setMealForm({ ...mealForm, carbs: event.target.value })} inputMode="decimal" min="0" placeholder="0" aria-label="الكربوهيدرات" /><b>g</b></div></label>
              <label className="fat"><span>دهون</span><div dir="ltr"><input value={mealForm.fat} onChange={(event) => setMealForm({ ...mealForm, fat: event.target.value })} inputMode="decimal" min="0" placeholder="0" aria-label="الدهون" /><b>g</b></div></label>
            </div>
            <p className="meal-optional-note">الماكروز اختيارية — سجّل المتوفر فقط.</p>
            {mealError && <p className="form-error meal-form-error" role="alert">{mealError}</p>}
            <button type="submit" className="meal-save-button"><Check size={19} /> {editingMealId ? "حفظ التعديلات" : "حفظ الوجبة"}</button>
          </form>
        </Sheet>
      )}

      {sheet === "target" && (
        <Sheet title="أهدافك اليومية" onClose={() => setSheet(null)}>
          <form className="target-entry-sheet" onSubmit={saveTarget}>
            <p className="target-intro">أرقام مرجعية لليوم فقط، ويمكنك تعديلها في أي وقت.</p>
            <label className="target-calorie-card">
              <span><small>الهدف الرئيسي</small>السعرات اليومية</span>
              <div dir="ltr"><input value={targetForm.calories} onChange={(event) => setTargetForm({ ...targetForm, calories: event.target.value })} type="text" inputMode="numeric" placeholder="0" autoFocus aria-label="هدف السعرات" /><b>kcal</b></div>
            </label>
            <div className="target-macro-grid">
              <label className="protein"><span>بروتين</span><div dir="ltr"><input value={targetForm.protein} onChange={(event) => setTargetForm({ ...targetForm, protein: event.target.value })} type="text" inputMode="decimal" placeholder="0" aria-label="هدف البروتين" /><b>g</b></div></label>
              <label className="carbs"><span>كربوهيدرات</span><div dir="ltr"><input value={targetForm.carbs} onChange={(event) => setTargetForm({ ...targetForm, carbs: event.target.value })} type="text" inputMode="decimal" placeholder="0" aria-label="هدف الكربوهيدرات" /><b>g</b></div></label>
              <label className="fat"><span>دهون</span><div dir="ltr"><input value={targetForm.fat} onChange={(event) => setTargetForm({ ...targetForm, fat: event.target.value })} type="text" inputMode="decimal" placeholder="0" aria-label="هدف الدهون" /><b>g</b></div></label>
            </div>
            <button type="submit" className="target-save-button"><Check size={19} /> حفظ الأهداف</button>
          </form>
        </Sheet>
      )}
    </main>
  );
}
