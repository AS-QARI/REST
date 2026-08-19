"use client";
/* eslint-disable @next/next/no-img-element -- Equipment photos are local data URLs before cloud sync. */

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  Dumbbell,
  Eye,
  EyeOff,
  History,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Minus,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LOOPREP_SESSIONS } from "./looprep-data";
import { loadAppData, saveAppData } from "./storage";
import { authenticateOwner, isSupabaseConfigured, loadOwnerSnapshot, saveOwnerSnapshot } from "./supabase";

export const dynamic = "force-static";

type Tab = "today" | "workout" | "nutrition" | "progress";
type WorkoutView = "templates" | "equipment";
type Sheet =
  | "equipment"
  | "template"
  | "meal"
  | "target"
  | "exercise"
  | "set"
  | null;
type SyncStatus = "synced" | "pending" | "error";

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

const BUILT_IN_EXERCISES: Exercise[] = [
  { id: "built-in-bench-press", name: "Bench Press", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 6, repMax: 12 },
  { id: "built-in-incline-press", name: "Incline Press", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 8, repMax: 12 },
  { id: "built-in-chest-fly", name: "Chest Fly", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 10, repMax: 15 },
  { id: "built-in-push-up", name: "Push-Up", equipmentId: "built-in", primaryMuscle: "Chest", repMin: 8, repMax: 20 },
  { id: "built-in-lat-pulldown", name: "Lat Pulldown", equipmentId: "built-in", primaryMuscle: "Back", repMin: 8, repMax: 12 },
  { id: "built-in-seated-row", name: "Seated Row", equipmentId: "built-in", primaryMuscle: "Back", repMin: 8, repMax: 12 },
  { id: "built-in-barbell-row", name: "Barbell Row", equipmentId: "built-in", primaryMuscle: "Back", repMin: 6, repMax: 12 },
  { id: "built-in-pull-up", name: "Pull-Up", equipmentId: "built-in", primaryMuscle: "Back", repMin: 5, repMax: 12 },
  { id: "built-in-shoulder-press", name: "Shoulder Press", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 6, repMax: 12 },
  { id: "built-in-lateral-raise", name: "Lateral Raise", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 10, repMax: 20 },
  { id: "built-in-rear-delt-fly", name: "Rear Delt Fly", equipmentId: "built-in", primaryMuscle: "Shoulders", repMin: 10, repMax: 20 },
  { id: "built-in-biceps-curl", name: "Biceps Curl", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-hammer-curl", name: "Hammer Curl", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-triceps-pushdown", name: "Triceps Pushdown", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-overhead-triceps", name: "Overhead Triceps Extension", equipmentId: "built-in", primaryMuscle: "Arms", repMin: 8, repMax: 15 },
  { id: "built-in-squat", name: "Squat", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 5, repMax: 12 },
  { id: "built-in-leg-press", name: "Leg Press", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 8, repMax: 15 },
  { id: "built-in-leg-extension", name: "Leg Extension", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 15 },
  { id: "built-in-leg-curl", name: "Leg Curl", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 15 },
  { id: "built-in-hip-thrust", name: "Hip Thrust", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 8, repMax: 15 },
  { id: "built-in-calf-raise", name: "Calf Raise", equipmentId: "built-in", primaryMuscle: "Legs", repMin: 10, repMax: 20 },
];

const EQUIPMENT_TYPES = ["آلة", "كيبل", "أوزان حرة", "بار", "وزن جسم", "أخرى"];
const MEAL_CATEGORIES = ["فطور", "غداء", "عشاء", "سناك", "قبل التمرين", "بعد التمرين"];
const NAVIGATION: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "اليوم", icon: Activity },
  { id: "workout", label: "التمرين", icon: Dumbbell },
  { id: "nutrition", label: "الوجبات", icon: Utensils },
  { id: "progress", label: "السجل", icon: BarChart3 },
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

function lastSevenDays() {
  const start = shiftDate(new Date(), -6);
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
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

function countLabel(count: number, singularPhrase: string, pluralPhrase: string) {
  return count === 1 ? singularPhrase : `${formatNumber(count)} ${pluralPhrase}`;
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

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
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

function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2>{title}</h2>
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
  const [supabaseConfigured] = useState(isSupabaseConfigured());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("rest-session") === "active",
  );
  const [tab, setTab] = useState<Tab>("today");
  const [workoutView, setWorkoutView] = useState<WorkoutView>("templates");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToastState] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);
  const showToast = (message: string, onUndo?: () => void) => {
    setToastState(message);
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
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroup | "All">("All");
  const [equipmentMuscleGroup, setEquipmentMuscleGroup] = useState<MuscleGroup | "All">("All");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [setForm, setSetForm] = useState({ weightKg: "", reps: "", rir: "2", type: "working" as "working" | "warmup" });
  const [selectedWorkoutDate, setSelectedWorkoutDate] = useState(() => new Date());
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(() => new Date());
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadAppData<AppData>();
      let next = stored ?? EMPTY_DATA;
      if (isSupabaseConfigured()) {
        try {
          const remote = await loadOwnerSnapshot<AppData>();
          if (remote) {
            next = remote;
            await saveAppData(remote);
          }
        } catch {
          // Offline mode remains the source of truth until the next successful sync.
        }
      }
      const merged = mergeLoopRepHistory(next);
      const importedCount = merged.sessions.length - next.sessions.length;
      if (importedCount > 0) {
        next = merged;
        await saveAppData(next);
        if (isSupabaseConfigured()) {
          try {
            await saveOwnerSnapshot(next);
          } catch {
            // The local import remains available and will sync on the next successful save.
          }
        }
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
      navigator.serviceWorker.register("/REST/sw.js", { scope: "/REST/" }).catch(() => undefined);
    }
    return () => { active = false; };
    // Runs once on mount; selectedWorkoutDate's initial value (today) is what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToastState(null); setToastUndo(null); }, 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, workoutView]);

  const persist = (raw: AppData) => {
    const next = reconcileActiveWorkoutIntoSessions(raw);
    setData(next);
    void saveAppData(next);
    if (supabaseConfigured) {
      setSyncStatus("pending");
      void saveOwnerSnapshot(next)
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }
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

  const todayMeals = useMemo(() => data.meals.filter((meal) => isToday(meal.createdAt)), [data.meals]);
  const nutrition = useMemo(() => sumMeal(todayMeals), [todayMeals]);
  const pastMealDays = useMemo(() => {
    const past = data.meals.filter((meal) => !isToday(meal.createdAt));
    const groups = new Map<string, Meal[]>();
    past.forEach((meal) => {
      const key = new Date(meal.createdAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), meal]);
    });
    return Array.from(groups.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .map(([key, meals]) => ({ key, meals, calories: meals.reduce((sum, meal) => sum + meal.calories, 0) }));
  }, [data.meals]);
  const sortedSessions = useMemo(
    () => [...data.sessions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [data.sessions],
  );
  const workoutWeekDays = useMemo(() => {
    const start = new Date(selectedWorkoutDate);
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  }, [selectedWorkoutDate]);
  const selectedWorkoutDaySessions = useMemo(
    () => sortedSessions.filter((session) => calendarDayKey(session.completedAt) === calendarDayKey(selectedWorkoutDate)),
    [selectedWorkoutDate, sortedSessions],
  );
  const otherSessionsForDay = useMemo(
    () => selectedWorkoutDaySessions.filter((session) => session.id !== data.activeWorkout?.id),
    [selectedWorkoutDaySessions, data.activeWorkout],
  );
  const workoutWeekLabel = useMemo(() => new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
    month: "long",
    year: "numeric",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(selectedWorkoutDate), [selectedWorkoutDate]);
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
  const totalWorkingSets = useMemo(
    () => data.sessions.reduce((count, session) => count + session.exercises.reduce(
      (sets, exercise) => sets + exercise.sets.filter((set) => set.type === "working").length, 0), 0),
    [data.sessions],
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
  const exerciseDraftEquipment = data.equipment.find((equipment) => equipment.id === exerciseDraftMeta?.equipmentId);
  const getExerciseHistory = (exerciseId: string) => sortedSessions.flatMap((session) => {
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
  const getExercisePersonalBest = (exerciseId: string) => {
    let best: SetLog | undefined;
    data.sessions.forEach((session) => session.exercises.forEach((exercise) => {
      if (exercise.exerciseId !== exerciseId) return;
      exercise.sets.forEach((set) => {
        if (set.type === "working" && (!best || set.weightKg > best.weightKg)) best = set;
      });
    }));
    return best;
  };
  const exerciseHistory = getExerciseHistory(exerciseToAdd);
  const exercisePersonalBest = getExercisePersonalBest(exerciseToAdd);
  const daysSinceLastTrained = exerciseHistory.length ? daysSince(exerciseHistory[0].date) : null;
  const activeSetCount = data.activeWorkout ? countLoggedSets(data.activeWorkout.exercises) : 0;
  const activeRepCount = data.activeWorkout ? countLoggedReps(data.activeWorkout.exercises) : 0;
  const activeVolume = data.activeWorkout ? workoutVolume(data.activeWorkout.exercises) : 0;
  const totalLoggedVolume = useMemo(
    () => data.sessions.reduce((total, session) => total + workoutVolume(session.exercises), 0),
    [data.sessions],
  );
  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat(ARABIC_WITH_LATIN_NUMBERS, {
      weekday: "long",
      day: "numeric",
      month: "long",
      calendar: "gregory",
      numberingSystem: "latn",
    }).format(new Date()),
    [],
  );
  const latestSetFor = (exerciseId: string) => {
    for (const session of data.sessions) {
      const sets = session.exercises.find((item) => item.exerciseId === exerciseId)?.sets ?? [];
      const found = [...sets].reverse().find((set) => set.type === "working");
      if (found) return found;
    }
    return undefined;
  };

  const activeExercise = data.activeWorkout?.exercises.find((item) => item.exerciseId === selectedExerciseId);
  const activeExerciseMeta = exerciseCatalog.find((item) => item.id === selectedExerciseId);

  const openCompactSetSheet = () => {
    if (!activeExerciseMeta) return;
    const previous = latestSetFor(activeExerciseMeta.id);
    setSetForm({ weightKg: previous ? String(previous.weightKg) : "", reps: "", rir: "2", type: "working" });
    setSheet("set");
  };

  const stepSetFormValue = (field: "weightKg" | "reps", amount: number) => {
    setSetForm((current) => {
      const minimum = field === "reps" ? 1 : 0;
      const next = Math.max(minimum, (Number(current[field]) || 0) + amount);
      return { ...current, [field]: String(next) };
    });
  };

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
    setTab("today");
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
      if (supabaseConfigured) {
        const remote = await loadOwnerSnapshot<AppData>();
        if (remote) {
          setData(remote);
          await saveAppData(remote);
        } else {
          await saveOwnerSnapshot(data);
        }
      }
      setSignedIn(true);
    } catch {
      setLoginError("تعذر الاتصال الآن. تحقق من الشبكة أو بيانات Supabase.");
    } finally {
      setLoginPending(false);
    }
  };

  const closeEquipmentSheet = () => {
    setEditingEquipmentId(null);
    setEquipmentForm({ name: "", primaryMuscle: "", type: "آلة", exerciseName: "", notes: "", photos: [] });
    setSheet(null);
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
      persist({
        ...data,
        equipment: data.equipment.map((item) => item.id === editingEquipmentId
          ? {
              ...item,
              name: equipmentForm.name.trim(),
              primaryMuscle: equipmentForm.primaryMuscle,
              type: equipmentForm.type,
              photos: equipmentForm.photos.length ? equipmentForm.photos : undefined,
              notes: equipmentForm.notes.trim() || undefined,
            }
          : item),
      });
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
    const exercise: Exercise | null = equipmentForm.exerciseName.trim()
      ? {
          id: uid(),
          name: equipmentForm.exerciseName.trim(),
          equipmentId: equipment.id,
          primaryMuscle: equipment.primaryMuscle,
          repMin: 8,
          repMax: 12,
        }
      : null;
    persist({
      ...data,
      equipment: [equipment, ...data.equipment],
      exercises: exercise ? [exercise, ...data.exercises] : data.exercises,
    });
    closeEquipmentSheet();
    showToast(exercise ? "تم حفظ الجهاز والتمرين" : "تم حفظ الجهاز محليًا");
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
    if (data.activeWorkout.exercises.some((item) => item.exerciseId === exerciseToAdd)) {
      showToast("التمرين موجود بالفعل في هذه الحصة");
      resetExerciseLogger();
      return;
    }
    const now = new Date().toISOString();
    const sets: SetLog[] = exerciseDraftSets.flatMap((draft) => {
      const weightKg = readNumericInput(draft.weightKg);
      const reps = readNumericInput(draft.reps);
      if (weightKg === null || reps === null || weightKg < 0 || reps < 1) return [];
      return [{ id: uid(), weightKg, reps, rir: 2, type: "working", completedAt: now }];
    });
    if (!sets.length) {
      showToast("أدخل الوزن والتكرارات أولًا");
      return;
    }
    const nextActive: ActiveWorkout = {
      ...data.activeWorkout,
      exercises: [...data.activeWorkout.exercises, {
        exerciseId: exerciseToAdd,
        sets,
        notes: exerciseNotes.trim() || undefined,
      }],
    };
    const nextExercises = data.exercises.some((exercise) => exercise.id === exerciseDraftMeta.id)
      ? data.exercises
      : [exerciseDraftMeta, ...data.exercises];
    persist({ ...data, exercises: nextExercises, activeWorkout: nextActive });
    setSelectedExerciseId(exerciseToAdd);
    resetExerciseLogger();
    setExerciseSearch("");
    if (closeAfterSave) setSheet(null);
    showToast(closeAfterSave ? "تم حفظ التمرين وجلساته" : "تم الحفظ — اختر التمرين التالي");
  };

  const saveSet = (event: FormEvent) => {
    event.preventDefault();
    if (!data.activeWorkout || !activeExercise || !selectedExerciseId) return;
    const weightKg = readNumericInput(setForm.weightKg);
    const reps = readNumericInput(setForm.reps);
    if (weightKg === null || reps === null || reps < 1 || weightKg < 0) return;
    const set: SetLog = {
      id: uid(),
      weightKg,
      reps,
      rir: setForm.rir ? Number(setForm.rir) : undefined,
      type: setForm.type,
      completedAt: new Date().toISOString(),
    };
    const nextActive: ActiveWorkout = {
      ...data.activeWorkout,
      exercises: data.activeWorkout.exercises.map((item) =>
        item.exerciseId === selectedExerciseId ? { ...item, sets: [...item.sets, set] } : item,
      ),
    };
    persist({ ...data, activeWorkout: nextActive });
    setSetForm((current) => ({ weightKg: String(weightKg), reps: "", rir: current.rir, type: "working" }));
    setSheet(null);
    showToast("حُفظت المجموعة على هذا الجهاز");
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
      createdAt: new Date().toISOString(),
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
          <p className="local-note"><LockKeyhole size={14} /> {supabaseConfigured ? "Supabase مفعّل · نسخة محلية تعمل دون إنترنت" : "وضع محلي مؤقت إلى حين ربط Supabase"}</p>
        </section>
      </main>
    );
  }

  const todayWeekDays = lastSevenDays();
  const nutritionRemaining = data.nutritionTarget.calories - nutrition.calories;

  const todayContent = (
    <>
      <header className="daily-heading">
        <div className="daily-date"><span className="pulse-dot" /> {todayLabel}</div>
        <h1>اليوم، <em>بوضوح.</em></h1>
        <p>أسبوعك، تمرينك، ووجباتك — بنظرة وحدة.</p>
      </header>

      <section className="today-week-strip" aria-label="أيام هذا الأسبوع">
        {todayWeekDays.map((day) => {
          const key = calendarDayKey(day);
          const trained = sessionDayKeys.has(key);
          const today = isToday(day.toISOString());
          return (
            <div className={`today-week-day${today ? " today" : ""}${trained ? " trained" : ""}`} key={key}>
              <span>{ARABIC_WEEK_INITIALS[day.getDay()]}</span>
              <b>{formatNumber(day.getDate())}</b>
              <i />
            </div>
          );
        })}
      </section>

      {data.activeWorkout ? (
        <section className="today-card today-workout-card">
          <div className="today-card-icon"><Activity size={22} /></div>
          <div>
            <p>تمرين اليوم</p>
            <h2>{data.activeWorkout.name}</h2>
            <span>{countLabel(activeSetCount, "مجموعة واحدة", "مجموعات")} · {formatNumber(activeVolume)} كغ</span>
          </div>
          <button className="round-action" onClick={() => setTab("workout")} aria-label="متابعة التمرين"><ChevronLeft size={22} /></button>
        </section>
      ) : (
        <section className="today-card today-workout-card">
          <div className="today-card-icon"><Dumbbell size={22} /></div>
          <div><p>تمرين اليوم</p><h2>لم تبدأ تمرينًا بعد</h2><span>سجّل مجموعاتك عندما تكون جاهزًا.</span></div>
          <button className="round-action" onClick={() => startWorkout()} aria-label="ابدأ التمرين"><Plus size={21} /></button>
        </section>
      )}

      <section className="today-card today-nutrition-card">
        <div className="today-card-icon"><Utensils size={22} /></div>
        <div>
          <p>وجبات اليوم</p>
          <h2>{todayMeals.length ? countLabel(todayMeals.length, "وجبة واحدة مسجلة", "وجبات مسجلة") : "لم تسجّل وجبة بعد"}</h2>
          <span>
            {data.nutritionTarget.calories
              ? nutritionRemaining >= 0
                ? `${formatNumber(nutritionRemaining)} kcal متبقية`
                : `تجاوزت الهدف بـ${formatNumber(Math.abs(nutritionRemaining))} kcal`
              : `${formatNumber(nutrition.calories)} kcal · ${formatNumber(nutrition.protein)} غ بروتين`}
          </span>
        </div>
        <button className="round-action" onClick={() => openMealSheet()} aria-label="إضافة وجبة"><Plus size={21} /></button>
      </section>
    </>
  );

  const workoutContent = (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">بلا جداول معقدة</p><h1>التمرين</h1></div>
        <button
          className="icon-button surface"
          onClick={() => setWorkoutView(workoutView === "equipment" ? "templates" : "equipment")}
          aria-label={workoutView === "equipment" ? "العودة للتمرين" : "إدارة المعدات"}
        >
          {workoutView === "equipment" ? <ChevronLeft size={20} /> : <Settings2 size={20} />}
        </button>
      </header>

      {workoutView === "templates" && (
      <section className="workout-day-browser" aria-label="سجل التمرين حسب اليوم">
        <div className="workout-day-browser-head">
          <div><small>سجل الأيام</small><strong>{workoutWeekLabel}</strong></div>
          <div className="workout-week-actions">
            <button type="button" onClick={() => selectWorkoutDate(shiftDate(selectedWorkoutDate, -7))} aria-label="الأسبوع السابق"><ChevronRight size={17} /></button>
            <button type="button" className="workout-today-button" onClick={() => selectWorkoutDate(new Date())}>اليوم</button>
            <button type="button" onClick={() => selectWorkoutDate(shiftDate(selectedWorkoutDate, 7))} aria-label="الأسبوع التالي"><ChevronLeft size={17} /></button>
          </div>
        </div>
        <div className="workout-day-rail">
          {workoutWeekDays.map((day) => {
            const key = calendarDayKey(day);
            const selected = key === calendarDayKey(selectedWorkoutDate);
            const trained = sortedSessions.some((session) => calendarDayKey(session.completedAt) === key);
            return (
              <button type="button" key={key} className={`${selected ? "selected " : ""}${trained ? "trained" : ""}`} onClick={() => selectWorkoutDate(day)} aria-pressed={selected} aria-label={formatDayHeading(day.toISOString())}>
                <span>{ARABIC_WEEK_DAYS[day.getDay()]}</span>
                <b>{day.getDate()}</b>
                <i />
              </button>
            );
          })}
        </div>
        {activeSetCount > 0 && (
          <div className="workout-summary-metrics" aria-label="ملخص الحصة">
            <article><span>عدات</span><b>{formatNumber(activeRepCount)}</b></article>
            <article><span>جلسات</span><b>{formatNumber(activeSetCount)}</b></article>
            <article><span>الوزن المرفوع</span><b>{formatNumber(activeVolume)} <small>كغ</small></b></article>
          </div>
        )}
        <div className="workout-day-log">
          <div className="workout-day-log-head">
            <strong>{formatDayHeading(selectedWorkoutDate.toISOString())}</strong>
            <span>{countLabel(selectedWorkoutDaySessions.length, "حصة واحدة", "حصص")}</span>
          </div>

          {otherSessionsForDay.map((session) => (
            <article className="workout-history-card" key={session.id}>
              <div className="workout-history-title">
                <div><h2>{session.name}</h2><p>{countLabel(session.exercises.length, "تمرين واحد", "تمارين")} · {countLabel(countLoggedSets(session.exercises), "مجموعة واحدة", "مجموعات")}</p></div>
                <b>{formatNumber(workoutVolume(session.exercises))}<small> kg</small></b>
              </div>
              <div className="workout-history-exercises">
                {session.exercises.map((logged) => {
                  const exercise = exerciseCatalog.find((item) => item.id === logged.exerciseId);
                  const workingSets = logged.sets.filter((set) => set.type === "working");
                  const heaviest = workingSets.length ? Math.max(...workingSets.map((set) => set.weightKg)) : 0;
                  return exercise ? (
                    <div key={logged.exerciseId}>
                      <span><Dumbbell size={14} />{exercise.name}</span>
                      <b>{formatNumber(logged.sets.length)} × {formatNumber(heaviest)} kg</b>
                    </div>
                  ) : null;
                })}
              </div>
            </article>
          ))}

          {data.activeWorkout ? (
            data.activeWorkout.exercises.length === 0 ? (
              <EmptyState icon={<CirclePlus size={27} />} title="ابدأ بإضافة تمرين" body="اختر قسم العضلة، ثم اختر التمرين وابدأ تسجيل مجموعاتك." action={<AppButton onClick={() => setSheet("exercise")} icon={<Plus size={18} />}>إضافة تمرين</AppButton>} />
            ) : (
              <>
                <div className="exercise-tabs" aria-label="تمارين الحصة">
                  {data.activeWorkout.exercises.map((item) => {
                    const exercise = exerciseCatalog.find((entry) => entry.id === item.exerciseId);
                    return exercise ? <button key={item.exerciseId} className={selectedExerciseId === item.exerciseId ? "selected" : ""} onClick={() => setSelectedExerciseId(item.exerciseId)}><span>{exercise.name}</span><b>{formatNumber(item.sets.length)}</b></button> : null;
                  })}
                  <button className="add-exercise-tab" onClick={() => setSheet("exercise")} aria-label="إضافة تمرين"><Plus size={17} /></button>
                </div>
                {activeExerciseMeta && activeExercise && (
                  <article className="exercise-log-card">
                    <div className="exercise-log-title">
                      <div><p className="eyebrow">{muscleGroupFor(activeExerciseMeta.primaryMuscle) ?? activeExerciseMeta.primaryMuscle} · هدف {activeExerciseMeta.repMin}–{activeExerciseMeta.repMax}</p><h2>{activeExerciseMeta.name}</h2></div>
                      <div className="exercise-log-actions">
                        <button type="button" className="card-delete" onClick={() => removeExerciseFromWorkout(activeExerciseMeta.id)} aria-label={`إزالة ${activeExerciseMeta.name} من الحصة`}><Trash2 size={18} /></button>
                        <Dumbbell size={22} />
                      </div>
                    </div>
                    {(() => {
                      const latestSet = latestSetFor(activeExerciseMeta.id);
                      const personalBest = getExercisePersonalBest(activeExerciseMeta.id);
                      return (
                        <div className="performance-stats">
                          <article className={latestSet ? "" : "muted"}>
                            <span><TrendingUp size={15} /> آخر أداء</span>
                            {latestSet ? <b>{formatNumber(latestSet.weightKg)} <small>كغ</small> × {formatNumber(latestSet.reps)}</b> : <small>أول مرة تسجل هذا التمرين</small>}
                          </article>
                          <article className={personalBest ? "pb" : "muted"}>
                            <span><Sparkles size={15} /> أقوى أداء</span>
                            {personalBest ? <b>{formatNumber(personalBest.weightKg)} <small>كغ</small> × {formatNumber(personalBest.reps)}</b> : <small>لا يوجد سجل بعد</small>}
                          </article>
                        </div>
                      );
                    })()}
                    {activeExercise.notes && <p className="exercise-note-callout">{activeExercise.notes}</p>}
                    <div className="set-history" aria-label="مجموعات التمرين">
                      {activeExercise.sets.length === 0 ? (
                        <p className="no-sets">أضف أول مجموعة وستظهر كإنجاز بسيط هنا.</p>
                      ) : (
                        (() => {
                          let workingIndex = 0;
                          return activeExercise.sets.map((set) => {
                            if (set.type === "working") workingIndex += 1;
                            return (
                              <article className="set-chip" key={set.id}>
                                <span className="set-index">{set.type === "warmup" ? "إحماء" : `مجموعة ${workingIndex}`}</span>
                                <b dir="ltr">{set.weightKg} <small>كغ</small></b>
                                <b dir="ltr">× {set.reps}</b>
                                <span>RIR {set.rir ?? "—"}</span>
                              </article>
                            );
                          });
                        })()
                      )}
                    </div>
                    <div className="exercise-card-footer">
                      <span>{countLabel(activeExercise.sets.length, "جلسة واحدة مسجلة", "جلسات مسجلة")}</span>
                      <button type="button" onClick={openCompactSetSheet}><Plus size={16} /> إضافة جلسة</button>
                    </div>
                  </article>
                )}
              </>
            )
          ) : otherSessionsForDay.length === 0 ? (
            <div className="workout-day-empty">
              <Dumbbell size={18} />
              <span>لا يوجد تمرين مسجل في هذا اليوم</span>
              <button type="button" className="text-action" onClick={() => startWorkout()}><Plus size={16} /> إضافة تمرين</button>
            </div>
          ) : null}
        </div>
      </section>
      )}

      {workoutView === "templates" && !data.activeWorkout && data.templates.length > 0 && (
        <section className="section-block">
          <div className="section-title">
            <div><p className="eyebrow">قوالبك</p><h2>ابدأ من قالب</h2></div>
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
                {(["All", ...MUSCLE_GROUPS] as const).map((group) => <button type="button" key={group} className={equipmentMuscleGroup === group ? "selected" : ""} onClick={() => setEquipmentMuscleGroup(group)}>{group === "All" ? "الكل" : group}</button>)}
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
                      <div><h2>{equipment.name}</h2><p dir="ltr">{equipment.primaryMuscle} · {equipment.type}</p><span>{countLabel(data.exercises.filter((item) => item.equipmentId === equipment.id).length, "تمرين واحد مرتبط", "تمارين مرتبطة")}</span></div>
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
      <header className="page-heading">
        <div><p className="eyebrow">سجل يدوي واضح</p><h1>التغذية</h1></div>
        <button className="icon-button surface" onClick={openTargetSheet} aria-label="ضبط أهداف التغذية"><Target size={20} /></button>
      </header>
      <section className="nutrition-summary">
        <div className={`calorie-ring${data.nutritionTarget.calories ? "" : " empty"}`} style={{ "--progress": `${data.nutritionTarget.calories ? Math.min(100, (nutrition.calories / data.nutritionTarget.calories) * 100) : 0}%` } as React.CSSProperties}>
          <div><span>السعرات</span><strong>{formatNumber(nutrition.calories)}</strong><small>{data.nutritionTarget.calories ? `من ${formatNumber(data.nutritionTarget.calories)}` : "حدد هدفك"}</small></div>
        </div>
        <div className="macro-summary">
          <p className="eyebrow">ملخص اليوم</p>
          <h2>{data.nutritionTarget.calories ? `${formatNumber(Math.max(0, data.nutritionTarget.calories - nutrition.calories))} kcal متبقية` : "حدّد أهدافك أولًا"}</h2>
          <button className="text-action" onClick={openTargetSheet}><Settings2 size={16} /> ضبط الأهداف</button>
        </div>
      </section>
      <div className="macro-grid">
        {[
          ["بروتين", nutrition.protein, data.nutritionTarget.protein, "protein"],
          ["كربوهيدرات", nutrition.carbs, data.nutritionTarget.carbs, "carbs"],
          ["دهون", nutrition.fat, data.nutritionTarget.fat, "fat"],
        ].map(([label, current, target, tone]) => <article className="macro-card" key={String(label)}><div><span>{label}</span><b>{formatNumber(Number(current))} غ</b></div><div className="macro-track"><span className={String(tone)} style={{ width: `${Number(target) ? Math.min(100, (Number(current) / Number(target)) * 100) : 0}%` }} /></div><small>{Number(target) ? `من ${formatNumber(Number(target))} غ` : "لا يوجد هدف"}</small></article>)}
      </div>
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">وجبات اليوم</p><h2>ما سجلته</h2></div><button className="text-action" onClick={() => openMealSheet()}><Plus size={17} /> إضافة</button></div>
        {todayMeals.length === 0 ? <EmptyState icon={<Utensils size={27} />} title="أضف وجبتك الأولى" body="أدخل السعرات والماكروز التي تعرفها، بلا تخمين ولا إلزام بصورة." action={<AppButton onClick={() => openMealSheet()} icon={<Plus size={18} />}>إضافة وجبة</AppButton>} /> : <div className="meal-list">{todayMeals.map((meal) => <article className="meal-card" key={meal.id}><div className="meal-icon"><Utensils size={19} /></div><div><p>{meal.category} · {formatDate(meal.createdAt)}</p><h2>{meal.name}</h2><span>{formatNumber(meal.protein)} ب · {formatNumber(meal.carbs)} ك · {formatNumber(meal.fat)} د</span></div><strong>{formatNumber(meal.calories)}<small> kcal</small></strong><button className="card-edit" onClick={() => openMealSheet(meal)} aria-label={`تعديل ${meal.name}`}><Pencil size={16} /></button><button className="card-delete" onClick={() => deleteMeal(meal.id)} aria-label={`حذف ${meal.name}`}><Trash2 size={18} /></button></article>)}</div>}
      </section>
      {pastMealDays.length > 0 && (
        <section className="section-block">
          <div className="section-title"><div><p className="eyebrow">سجلك الغذائي</p><h2>أيام سابقة</h2></div></div>
          {pastMealDays.map((day) => (
            <div className="day-group" key={day.key}>
              <div className="day-group-head"><span>{formatDayHeading(day.meals[0].createdAt)}</span><b>{formatNumber(day.calories)} kcal</b></div>
              <div className="meal-list">
                {day.meals.map((meal) => (
                  <article className="meal-card" key={meal.id}>
                    <div className="meal-icon"><Utensils size={20} /></div>
                    <div><p>{meal.category}</p><h2>{meal.name}</h2><span>{formatNumber(meal.protein)} ب · {formatNumber(meal.carbs)} ك · {formatNumber(meal.fat)} د</span></div>
                    <strong>{formatNumber(meal.calories)}<small> kcal</small></strong>
                    <button className="card-edit" onClick={() => openMealSheet(meal)} aria-label={`تعديل ${meal.name}`}><Pencil size={16} /></button>
                    <button className="card-delete" onClick={() => deleteMeal(meal.id)} aria-label={`حذف ${meal.name}`}><Trash2 size={18} /></button>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );

  const progressContent = (
    <>
      <header className="page-heading"><div><p className="eyebrow">ارجع لأي يوم</p><h1>السجل</h1></div><BarChart3 className="header-icon" size={24} /></header>

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
              <button type="button" onClick={() => setSelectedHistoryDate((date) => shiftMonth(date, -1))} aria-label="الشهر السابق"><ChevronRight size={19} /></button>
              <strong>{historyMonthLabel}</strong>
              <button type="button" onClick={() => setSelectedHistoryDate((date) => shiftMonth(date, 1))} aria-label="الشهر التالي"><ChevronLeft size={19} /></button>
              <button type="button" className="today-jump" onClick={() => { setSelectedHistoryDate(new Date()); setExpandedSessionId(null); setCalendarExpanded(false); }}>اليوم</button>
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
                    onClick={() => { setSelectedHistoryDate(day); setExpandedSessionId(null); setCalendarExpanded(false); }}
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

      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">منذ البداية</p><h2>الإجمالي</h2></div></div>
        <div className="totals-grid">
          <article><Dumbbell size={17} /><span>الحصص</span><strong>{formatNumber(data.sessions.length)}</strong></article>
          <article><Activity size={17} /><span>مجموعات العمل</span><strong>{formatNumber(totalWorkingSets)}</strong></article>
          <article><TrendingUp size={17} /><span>الحجم الكلي</span><strong dir="ltr">{formatNumber(totalLoggedVolume)}<small>kg</small></strong></article>
        </div>
      </section>
    </>
  );

  const content = tab === "today" ? todayContent : tab === "workout" ? workoutContent : tab === "nutrition" ? nutritionContent : progressContent;
  const syncLabel = !supabaseConfigured
    ? "محفوظ على جهازك"
    : syncStatus === "pending"
      ? "جارٍ الحفظ…"
      : syncStatus === "error"
        ? "تعذّرت المزامنة"
        : "متزامن";

  return (
    <main className="app-shell">
      <div className="app-top">
        <Logo />
        <div className="sync-indicator" data-status={supabaseConfigured ? syncStatus : "local"}>
          <span className="sync-dot" /> {syncLabel}
        </div>
        <button className="icon-button surface" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
      </div>
      <div className={`page-content view-${tab} view-${workoutView}`}>{content}</div>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {NAVIGATION.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} /> {toast}
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
            <label><span>اسم الجهاز <b>*</b></span><input value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} placeholder="مثال: Chest Press Machine" autoFocus /></label>
            <fieldset className="muscle-fieldset">
              <legend>المجموعة العضلية <b>*</b></legend>
              <div className="muscle-group-grid compact" role="group" aria-label="المجموعة العضلية" dir="ltr">
                {MUSCLE_GROUPS.map((muscle) => <button type="button" key={muscle} className={equipmentForm.primaryMuscle === muscle ? "selected" : ""} onClick={() => setEquipmentForm({ ...equipmentForm, primaryMuscle: muscle })} aria-pressed={equipmentForm.primaryMuscle === muscle}>{muscle}</button>)}
              </div>
            </fieldset>
            <label><span>نوع الجهاز</span><select value={equipmentForm.type} onChange={(event) => setEquipmentForm({ ...equipmentForm, type: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
            {!editingEquipmentId && (
              <label><span>اسم التمرين على الجهاز <em>اختياري</em></span><input dir="ltr" value={equipmentForm.exerciseName} onChange={(event) => setEquipmentForm({ ...equipmentForm, exerciseName: event.target.value })} placeholder="e.g. Seated Chest Press" /></label>
            )}
            <label><span>ملاحظات <em>اختياري</em></span><textarea value={equipmentForm.notes} onChange={(event) => setEquipmentForm({ ...equipmentForm, notes: event.target.value })} placeholder="رقم المقعد، إعداد الجهاز، أو أي تلميح مهم" rows={3} /></label>
            <AppButton type="submit" disabled={!equipmentForm.name.trim() || !equipmentForm.primaryMuscle} icon={<Check size={18} />}>{editingEquipmentId ? "حفظ التعديلات" : "حفظ الجهاز"}</AppButton>
          </form>
        </Sheet>
      )}

      {sheet === "template" && <Sheet title="إنشاء جدولك" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTemplate}><label><span>اسم الجدول <b>*</b></span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="اكتب الاسم الذي يناسبك" autoFocus /></label><fieldset className="exercise-picker"><legend>اختر التمارين <em>اختياري</em></legend>{data.exercises.length === 0 ? <p className="form-hint">أضف جهازًا وتمرينًا أولًا، أو أنشئ الجدول فارغًا وأكمله لاحقًا.</p> : data.exercises.map((exercise) => <label key={exercise.id} className="check-row"><input type="checkbox" checked={templateExercises.includes(exercise.id)} onChange={(event) => setTemplateExercises(event.target.checked ? [...templateExercises, exercise.id] : templateExercises.filter((id) => id !== exercise.id))} /><span>{exercise.name}</span><small>{exercise.primaryMuscle}</small></label>)}</fieldset><AppButton type="submit" icon={<Check size={18} />}>حفظ الجدول</AppButton></form></Sheet>}

      {sheet === "exercise" && (
        <Sheet title={`تسجيل تمرين · ${formatDate(selectedWorkoutDate.toISOString())}`} onClose={() => { resetExerciseLogger(); setExerciseSearch(""); setSheet(null); }}>
          <form className="exercise-session-form" onSubmit={(event) => { event.preventDefault(); saveExerciseDraft(true); }}>
            <div className="session-tool-row">
              <label className="library-search">
                <Search size={17} />
                <input value={exerciseSearch} onChange={(event) => { setExerciseSearch(event.target.value); if (exerciseToAdd) resetExerciseLogger(); }} placeholder="ابحث في معداتك..." aria-label="ابحث في معداتك" autoFocus={!exerciseDraftMeta} />
              </label>
              <button type="button" className="library-link compact-link" onClick={() => { resetExerciseLogger(); setExerciseSearch(""); setSheet(null); setWorkoutView("equipment"); }}><Dumbbell size={17} /><span>المكتبة</span></button>
            </div>

            {!exerciseDraftMeta ? (
              <>
                <div className="filter-rail exercise-filter" role="group" aria-label="المجموعات العضلية" dir="ltr">{(["All", ...MUSCLE_GROUPS] as const).map((group) => <button type="button" key={group} className={selectedMuscleGroup === group ? "selected" : ""} onClick={() => setSelectedMuscleGroup(group)} aria-pressed={selectedMuscleGroup === group}>{group === "All" ? "الكل" : group}</button>)}</div>
                <div className="exercise-choice-heading"><span>{selectedMuscleGroup === "All" ? "كل التمارين" : `${selectedMuscleGroup} Exercises`}</span><small>{formatNumber(exercisesInSelectedGroup.length)} تمارين</small></div>
                {exercisesInSelectedGroup.length === 0 ? <div className="library-empty"><Search size={20} /><span>لا توجد تمارين مطابقة</span></div> : (
                  <div className="exercise-picker-list" role="listbox" aria-label="تمارينك">{exercisesInSelectedGroup.map((exercise) => { const alreadyAdded = data.activeWorkout?.exercises.some((item) => item.exerciseId === exercise.id) ?? false; const equipment = data.equipment.find((item) => item.id === exercise.equipmentId); return <button type="button" role="option" aria-selected={false} disabled={alreadyAdded} className={alreadyAdded ? "added" : ""} key={exercise.id} onClick={() => selectExerciseForLogging(exercise.id)}><span className="picker-thumb">{equipment?.photos?.length ? <img src={equipment.photos[0]} alt="" /> : <Dumbbell size={18} />}</span><span><strong>{exercise.name}</strong><small>{muscleGroupFor(exercise.primaryMuscle)} · {exercise.repMin}–{exercise.repMax} reps</small></span>{alreadyAdded ? <Check size={17} /> : <ChevronLeft size={17} />}</button>; })}</div>
                )}
              </>
            ) : (
              <div className="exercise-logger">
                <div className="selected-exercise-strip">
                  <span className="selected-equipment-thumb">{exerciseDraftEquipment?.photos?.length ? <img src={exerciseDraftEquipment.photos[0]} alt="" /> : <Dumbbell size={19} />}</span>
                  <div><strong>{exerciseDraftMeta.name}</strong><small>{muscleGroupFor(exerciseDraftMeta.primaryMuscle)}</small></div>
                  <button type="button" onClick={resetExerciseLogger} aria-label="إلغاء اختيار التمرين"><X size={17} /></button>
                </div>

                <div className="exercise-insights">
                  <article><span>أقوى مستوى</span>{exercisePersonalBest ? <><b>{formatNumber(exercisePersonalBest.reps)} عدة</b><strong dir="ltr">{formatNumber(exercisePersonalBest.weightKg)} kg</strong></> : <small>لا يوجد سجل</small>}</article>
                  <article><span>آخر مرة</span>{daysSinceLastTrained !== null ? <b>{daysSinceLastTrained === 0 ? "اليوم" : `منذ ${formatNumber(daysSinceLastTrained)} يوم`}</b> : <small>لا يوجد سجل</small>}<History size={18} /></article>
                </div>

                <section className="exercise-history-card" aria-label="آخر أداء للتمرين">
                  <div className="history-title"><span><History size={16} /> آخر التمارين</span><small>{exerciseHistory.length ? countLabel(exerciseHistory.length, "حصة واحدة", "حصص") : "أول مرة"}</small></div>
                  {exerciseHistory.length ? (
                    <div className="history-table">
                      <div className="history-row history-head"><span>التاريخ</span><span>جلسات</span><span>عدات</span><span>وزن</span></div>
                      {exerciseHistory.map((entry) => <div className="history-row" key={entry.id}><span>{formatDate(entry.date)}</span><b>{formatNumber(entry.setCount)}</b><b dir="ltr">{entry.repLabel}</b><b dir="ltr">{formatNumber(entry.maxWeight)} kg</b></div>)}
                    </div>
                  ) : <p className="history-empty">سجّل أول أداء لك، وسيظهر هنا في المرة القادمة.</p>}
                </section>

                <section className="draft-sets" aria-label="جلسات التمرين الحالية">
                  <div className="draft-set-head"><span>جلسات</span><span>التكرارات</span><span>الوزن</span></div>
                  {exerciseDraftSets.map((draft, index) => (
                    <div className="draft-set-row" key={draft.id}>
                      <div className="draft-index"><b>{formatNumber(index + 1)}</b>{exerciseDraftSets.length > 1 && <button type="button" onClick={() => removeExerciseDraftSet(draft.id)} aria-label={`حذف الجلسة ${index + 1}`}><X size={14} /></button>}</div>
                      <div className="stepper-control" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", -1)} aria-label="إنقاص التكرارات"><Minus size={15} /></button><input value={draft.reps} onChange={(event) => updateExerciseDraftSet(draft.id, "reps", event.target.value)} type="text" inputMode="numeric" aria-label={`تكرارات الجلسة ${index + 1}`} /><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", 1)} aria-label="زيادة التكرارات"><Plus size={15} /></button></div>
                      <div className="stepper-control weight-stepper" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", -0.5)} aria-label="إنقاص الوزن"><Minus size={15} /></button><input value={draft.weightKg} onChange={(event) => updateExerciseDraftSet(draft.id, "weightKg", event.target.value)} type="text" inputMode="decimal" aria-label={`وزن الجلسة ${index + 1}`} /><span>kg</span><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", 0.5)} aria-label="زيادة الوزن"><Plus size={15} /></button></div>
                    </div>
                  ))}
                  <button type="button" className="add-draft-set" onClick={addExerciseDraftSet}><Plus size={16} /> إضافة جلسة</button>
                </section>

                <button type="button" className="notes-toggle" onClick={() => setShowExerciseNotes((visible) => !visible)}><Plus size={16} /> ملاحظات</button>
                {showExerciseNotes && <textarea className="exercise-notes" value={exerciseNotes} onChange={(event) => setExerciseNotes(event.target.value)} placeholder="اكتب ملاحظة عن الأداء أو إعداد الجهاز" rows={3} autoFocus />}

                <div className="exercise-save-actions">
                  <button type="submit" className="session-save">حفظ التمرين</button>
                  <button type="button" className="session-save-more" onClick={() => saveExerciseDraft(false)}><Plus size={17} /> إضافة آخر</button>
                </div>
              </div>
            )}
          </form>
        </Sheet>
      )}

      {sheet === "set" && (
        <Sheet title="إضافة جلسة" onClose={() => setSheet(null)}>
          <form className="set-session-sheet" onSubmit={saveSet}>
            <div className="set-exercise-banner">
              <span className="set-exercise-icon"><Dumbbell size={19} /></span>
              <div><small>التمرين الحالي</small><strong>{activeExerciseMeta?.name}</strong></div>
              <b>{activeExerciseMeta ? muscleGroupFor(activeExerciseMeta.primaryMuscle) : ""}</b>
            </div>

            <div className="set-metrics-grid">
              <label className="set-metric-card">
                <span>الوزن <small>kg</small></span>
                <div className="set-sheet-stepper" dir="ltr">
                  <button type="button" onClick={() => stepSetFormValue("weightKg", -0.5)} aria-label="إنقاص الوزن"><Minus size={17} /></button>
                  <input value={setForm.weightKg} onChange={(event) => setSetForm({ ...setForm, weightKg: event.target.value })} type="text" inputMode="decimal" placeholder="0" autoFocus aria-label="الوزن بالكيلوغرام" />
                  <button type="button" onClick={() => stepSetFormValue("weightKg", 0.5)} aria-label="زيادة الوزن"><Plus size={17} /></button>
                </div>
              </label>
              <label className="set-metric-card">
                <span>التكرارات <small>reps</small></span>
                <div className="set-sheet-stepper" dir="ltr">
                  <button type="button" onClick={() => stepSetFormValue("reps", -1)} aria-label="إنقاص التكرارات"><Minus size={17} /></button>
                  <input value={setForm.reps} onChange={(event) => setSetForm({ ...setForm, reps: event.target.value })} type="text" inputMode="numeric" placeholder="8" aria-label="عدد التكرارات" />
                  <button type="button" onClick={() => stepSetFormValue("reps", 1)} aria-label="زيادة التكرارات"><Plus size={17} /></button>
                </div>
              </label>
            </div>

            <fieldset className="set-choice-block">
              <legend>نوع الجلسة</legend>
              <div className="set-type-segment" role="group" aria-label="نوع الجلسة">
                <button type="button" className={setForm.type === "working" ? "selected" : ""} onClick={() => setSetForm({ ...setForm, type: "working" })}>مجموعة عمل</button>
                <button type="button" className={setForm.type === "warmup" ? "selected" : ""} onClick={() => setSetForm({ ...setForm, type: "warmup" })}>إحماء</button>
              </div>
            </fieldset>

            <fieldset className="set-choice-block rir-choice">
              <legend><span>RIR</span><small>التكرارات المتبقية</small></legend>
              <div className="rir-chip-row" role="group" aria-label="التكرارات المتبقية">
                {[0, 1, 2, 3, 4, 5].map((rir) => <button type="button" key={rir} className={setForm.rir === String(rir) ? "selected" : ""} onClick={() => setSetForm({ ...setForm, rir: String(rir) })} aria-pressed={setForm.rir === String(rir)}>{rir}</button>)}
              </div>
            </fieldset>

            <button type="submit" className="set-save-button"><Check size={19} /> حفظ الجلسة</button>
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
