"use client";
/* eslint-disable @next/next/no-img-element -- Equipment photos are local data URLs before cloud sync. */

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Camera,
  Check,
  ChevronLeft,
  CirclePlus,
  ClipboardList,
  Dumbbell,
  Eye,
  EyeOff,
  Flame,
  History,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Minus,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { loadAppData, saveAppData } from "./storage";
import { authenticateOwner, isSupabaseConfigured, loadOwnerSnapshot, saveOwnerSnapshot } from "./supabase";

type Tab = "today" | "workout" | "nutrition" | "progress";
type WorkoutView = "templates" | "equipment" | "active";
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
  photo?: string;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
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

function formatDuration(startedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, "0")}` : `${minutes} د`;
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

function workoutVolume(exercises: WorkoutExercise[]) {
  return exercises.reduce(
    (total, exercise) => total + exercise.sets
      .filter((set) => set.type === "working")
      .reduce((setTotal, set) => setTotal + set.weightKg * set.reps, 0),
    0,
  );
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState({
    name: "",
    primaryMuscle: "",
    type: "آلة",
    exerciseName: "",
    notes: "",
    photo: "",
  });
  const [templateName, setTemplateName] = useState("");
  const [templateExercises, setTemplateExercises] = useState<string[]>([]);
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
  const repsInputRef = useRef<HTMLInputElement>(null);

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
      if (!active) return;
      setData(next);
      setLoaded(true);
    })();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToastState(null); setToastUndo(null); }, 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, workoutView]);

  const showToast = (message: string, onUndo?: () => void) => {
    setToastState(message);
    setToastUndo(() => onUndo ?? null);
  };

  const persist = (next: AppData) => {
    setData(next);
    void saveAppData(next);
    if (supabaseConfigured) {
      setSyncStatus("pending");
      void saveOwnerSnapshot(next)
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }
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
  const exerciseCatalog = useMemo(
    () => [
      ...data.exercises,
      ...BUILT_IN_EXERCISES.filter((builtIn) => !data.exercises.some((exercise) => exercise.id === builtIn.id)),
    ],
    [data.exercises],
  );
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
  const exerciseHistory = useMemo(() => sortedSessions.flatMap((session) => {
    const logged = session.exercises.find((exercise) => exercise.exerciseId === exerciseToAdd);
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
  }).slice(0, 4), [exerciseToAdd, sortedSessions]);
  const exercisePersonalBest = useMemo(() => {
    let best: SetLog | undefined;
    data.sessions.forEach((session) => session.exercises.forEach((exercise) => {
      if (exercise.exerciseId !== exerciseToAdd) return;
      exercise.sets.forEach((set) => {
        if (set.type === "working" && (!best || set.weightKg > best.weightKg)) best = set;
      });
    }));
    return best;
  }, [data.sessions, exerciseToAdd]);
  const activeSetCount = data.activeWorkout ? countLoggedSets(data.activeWorkout.exercises) : 0;
  const activeVolume = data.activeWorkout ? workoutVolume(data.activeWorkout.exercises) : 0;
  const totalLoggedVolume = useMemo(
    () => data.sessions.reduce((total, session) => total + workoutVolume(session.exercises), 0),
    [data.sessions],
  );
  const heaviestWorkingSet = useMemo(() => {
    let heaviest: SetLog | undefined;
    data.sessions.forEach((session) => {
      session.exercises.forEach((exercise) => {
        exercise.sets.forEach((set) => {
          if (set.type === "working" && (!heaviest || set.weightKg > heaviest.weightKg)) heaviest = set;
        });
      });
    });
    return heaviest;
  }, [data.sessions]);
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

  const startWorkout = (template?: Template) => {
    const activeWorkout: ActiveWorkout = {
      id: uid(),
      name: template?.name || "تمرين جديد",
      startedAt: new Date().toISOString(),
      exercises: (template?.exerciseIds || []).map((exerciseId) => ({ exerciseId, sets: [] })),
    };
    persist({ ...data, activeWorkout });
    setSelectedExerciseId(activeWorkout.exercises[0]?.exerciseId || "");
    setTab("workout");
    setWorkoutView("active");
    showToast(template ? `بدأ تمرين ${template.name}` : "بدأ التمرين الفارغ");
  };

  const finishWorkout = () => {
    if (!data.activeWorkout) return;
    if (countLoggedSets(data.activeWorkout.exercises) === 0) {
      if (!window.confirm("لم تسجّل أي مجموعة بعد. إنهاء التمرين بلا حفظ؟")) return;
      persist({ ...data, activeWorkout: null });
      setWorkoutView("templates");
      showToast("تم إنهاء التمرين بلا حفظ");
      return;
    }
    const completed: WorkoutSession = { ...data.activeWorkout, completedAt: new Date().toISOString() };
    persist({ ...data, activeWorkout: null, sessions: [completed, ...data.sessions] });
    setWorkoutView("templates");
    showToast("تم حفظ التمرين محليًا");
  };

  const discardWorkout = () => {
    if (!data.activeWorkout) return;
    if (!window.confirm("تجاهل هذا التمرين؟ لن يُحفظ في سجلك.")) return;
    persist({ ...data, activeWorkout: null });
    setWorkoutView("templates");
    showToast("تم تجاهل التمرين");
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

  const saveEquipment = (event: FormEvent) => {
    event.preventDefault();
    if (!equipmentForm.name.trim() || !equipmentForm.primaryMuscle) return;
    const equipment: Equipment = {
      id: uid(),
      name: equipmentForm.name.trim(),
      primaryMuscle: equipmentForm.primaryMuscle,
      type: equipmentForm.type,
      photo: equipmentForm.photo || undefined,
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
    setEquipmentForm({ name: "", primaryMuscle: "", type: "آلة", exerciseName: "", notes: "", photo: "" });
    setSheet(null);
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
      const weightKg = Number(draft.weightKg);
      const reps = Number(draft.reps);
      if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg < 0 || reps < 1) return [];
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
    const weightKg = Number(setForm.weightKg);
    const reps = Number(setForm.reps);
    if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || reps < 1 || weightKg < 0) return;
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
    setMealForm({ name: "", category: "فطور", calories: "", protein: "", carbs: "", fat: "" });
    setMealError("");
    setSheet(null);
    showToast("تمت إضافة الوجبة");
  };

  const saveTarget = (event: FormEvent) => {
    event.preventDefault();
    const nutritionTarget: NutritionTarget = {
      calories: Number(targetForm.calories) || 0,
      protein: Number(targetForm.protein) || 0,
      carbs: Number(targetForm.carbs) || 0,
      fat: Number(targetForm.fat) || 0,
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

  const todayContent = (
    <>
      <header className="daily-heading">
        <div className="daily-date"><span className="pulse-dot" /> {todayLabel}</div>
        <h1>اليوم، <em>بوضوح.</em></h1>
        <p>تمرينك ووجباتك فقط — بدون أرقام لا تحتاجها الآن.</p>
      </header>

      {data.activeWorkout ? (
        <section className="today-card today-workout-card">
          <div className="today-card-icon"><Activity size={22} /></div>
          <div><p>تمرين اليوم</p><h2>{data.activeWorkout.name}</h2><span>{formatDuration(data.activeWorkout.startedAt)} · {data.activeWorkout.exercises.length} تمارين</span></div>
          <button className="round-action" onClick={() => { setTab("workout"); setWorkoutView("active"); }} aria-label="متابعة التمرين"><ChevronLeft size={22} /></button>
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
        <div><p>وجبات اليوم</p><h2>{todayMeals.length ? `${formatNumber(todayMeals.length)} وجبات مسجلة` : "لم تسجّل وجبة بعد"}</h2><span>{formatNumber(nutrition.calories)} kcal · {formatNumber(nutrition.protein)} غ بروتين</span></div>
        <button className="round-action" onClick={() => setSheet("meal")} aria-label="إضافة وجبة"><Plus size={21} /></button>
      </section>

      <section className="section-block compact-section today-actions">
        <div className="section-title">
          <div><p className="eyebrow">إجراءات اليوم</p><h2>سجّل الآن</h2></div>
        </div>
        <div className="quick-actions">
          <button onClick={() => startWorkout()}><Dumbbell size={20} /><span>تمرين الآن</span></button>
          <button onClick={() => setSheet("meal")}><Utensils size={20} /><span>أضف وجبة</span></button>
        </div>
      </section>
    </>
  );

  const workoutContent = (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">بلا جداول معقدة</p><h1>التمرين</h1></div>
        <button className="icon-button surface" onClick={() => setWorkoutView("equipment")} aria-label="إدارة المعدات"><Settings2 size={20} /></button>
      </header>
      {data.activeWorkout ? (
        <button className="active-strip" onClick={() => setWorkoutView("active")}>
          <span className="pulse-dot" /> تمرين جارٍ: {data.activeWorkout.name}<ChevronLeft size={17} />
        </button>
      ) : null}
      {workoutView !== "active" && (
        <div className="segment-control" role="tablist" aria-label="أقسام التمرين">
          <button className={workoutView === "templates" ? "selected" : ""} onClick={() => setWorkoutView("templates")}>ابدأ الآن</button>
          <button className={workoutView === "equipment" ? "selected" : ""} onClick={() => setWorkoutView("equipment")}>المعدات</button>
        </div>
      )}

      {workoutView === "templates" && (
        <section className="section-block">
          <div className="section-title">
            <div><p className="eyebrow">ادخل النادي وابدأ</p><h2>تمرين مباشر</h2></div>
          </div>
          {data.templates.length === 0 ? (
            <EmptyState icon={<Dumbbell size={27} />} title="ابدأ من أرض النادي" body="أنشئ حصة، أضف تمرينك الحالي، وسجّل مجموعاتك فورًا. المعدات محفوظة في قسم مستقل." action={<AppButton onClick={() => startWorkout()} icon={<ArrowLeft size={18} />}>ابدأ تمرينًا</AppButton>} />
          ) : (
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
          )}
          <div className="secondary-cta"><span>لا تحتاج خطة جاهزة لتبدأ.</span><AppButton variant="secondary" onClick={() => startWorkout()} icon={<Dumbbell size={18} />}>تمرين جديد</AppButton></div>
        </section>
      )}

      {workoutView === "equipment" && (
        <section className="section-block">
          <div className="section-title">
            <div><p className="eyebrow">مكتبتك الشخصية</p><h2>الأجهزة</h2></div>
            <button className="text-action" onClick={() => setSheet("equipment")}><Plus size={17} /> إضافة جهاز</button>
          </div>
          {data.equipment.length === 0 ? (
            <EmptyState icon={<Camera size={27} />} title="سجّل أول جهاز" body="صوّر الجهاز، اكتب اسمه، واختر العضلة الأساسية. البقية اختيارية." action={<AppButton onClick={() => setSheet("equipment")} icon={<Camera size={18} />}>إضافة جهاز</AppButton>} />
          ) : (
            <>
              <label className="library-search" dir="ltr">
                <Search size={18} />
                <input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Search your equipment" aria-label="Search equipment" />
              </label>
              <div className="filter-rail" role="group" aria-label="Equipment muscle groups" dir="ltr">
                {(["All", ...MUSCLE_GROUPS] as const).map((group) => <button type="button" key={group} className={equipmentMuscleGroup === group ? "selected" : ""} onClick={() => setEquipmentMuscleGroup(group)}>{group}</button>)}
              </div>
              {filteredEquipment.length === 0 ? (
                <div className="library-empty"><Search size={20} /><span>لا توجد أجهزة مطابقة</span></div>
              ) : (
                <div className="equipment-list">
                  {filteredEquipment.map((equipment) => (
                    <article className="equipment-card" key={equipment.id}>
                      <div className="equipment-image">
                        {equipment.photo ? <img src={equipment.photo} alt={`صورة ${equipment.name}`} /> : <Dumbbell size={26} />}
                      </div>
                      <div><h2>{equipment.name}</h2><p dir="ltr">{equipment.primaryMuscle} · {equipment.type}</p><span>{data.exercises.filter((item) => item.equipmentId === equipment.id).length} تمارين مرتبطة</span></div>
                      <button className="card-delete" onClick={() => deleteEquipment(equipment.id)} aria-label={`حذف ${equipment.name}`}><Trash2 size={18} /></button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {workoutView === "active" && data.activeWorkout && (
        <section className="live-workout">
          <div className="live-header">
            <button className="icon-button surface" onClick={() => setWorkoutView("templates")} aria-label="العودة لبدء التمرين"><ChevronLeft size={20} /></button>
            <div><p className="eyebrow">حصة جارية · {formatDuration(data.activeWorkout.startedAt)}</p><h1>{data.activeWorkout.name}</h1></div>
            <button className="discard-button" onClick={discardWorkout}>تجاهل</button>
            <button className="finish-button" onClick={finishWorkout}>إنهاء</button>
          </div>

          <div className="live-metrics" aria-label="ملخص الحصة الجارية">
            <article><span>تمارين</span><b>{formatNumber(data.activeWorkout.exercises.length)}</b></article>
            <article><span>مجموعات</span><b>{formatNumber(activeSetCount)}</b></article>
            <article><span>حجم العمل</span><b>{formatNumber(activeVolume)} <small>كغ</small></b></article>
          </div>

          {data.activeWorkout.exercises.length === 0 ? (
            <EmptyState icon={<CirclePlus size={27} />} title="ابدأ بإضافة تمرين" body="اختر قسم العضلة، ثم اختر التمرين وابدأ تسجيل مجموعاتك." action={<AppButton onClick={() => setSheet("exercise")} icon={<Plus size={18} />}>إضافة تمرين</AppButton>} />
          ) : (
            <>
              <div className="exercise-tabs" aria-label="تمارين الحصة">
                {data.activeWorkout.exercises.map((item) => {
                  const exercise = data.exercises.find((entry) => entry.id === item.exerciseId);
                  return exercise ? <button key={item.exerciseId} className={selectedExerciseId === item.exerciseId ? "selected" : ""} onClick={() => setSelectedExerciseId(item.exerciseId)}>{exercise.name}</button> : null;
                })}
                <button className="add-exercise-tab" onClick={() => setSheet("exercise")} aria-label="إضافة تمرين"><Plus size={17} /></button>
              </div>
              {activeExerciseMeta && activeExercise && (
                <article className="exercise-log-card">
                  <div className="exercise-log-title"><div><p className="eyebrow">{muscleGroupFor(activeExerciseMeta.primaryMuscle) ?? activeExerciseMeta.primaryMuscle} · هدف {activeExerciseMeta.repMin}–{activeExerciseMeta.repMax}</p><h2>{activeExerciseMeta.name}</h2></div><Dumbbell size={22} /></div>
                  {latestSetFor(activeExerciseMeta.id) ? (
                    <div className="previous-performance"><TrendingUp size={17} /><span>آخر أداء: <b>{latestSetFor(activeExerciseMeta.id)?.weightKg} كغ × {latestSetFor(activeExerciseMeta.id)?.reps}</b></span></div>
                  ) : <div className="previous-performance muted"><Sparkles size={17} /><span>هذه أول مرة تسجل هذا التمرين.</span></div>}
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
                  <form
                    className="quick-set-composer"
                    onSubmit={saveSet}
                    onFocus={() => setSetForm((current) => {
                      if (current.weightKg) return current;
                      const previousWeight = latestSetFor(activeExerciseMeta.id)?.weightKg;
                      return previousWeight === undefined ? current : { ...current, weightKg: String(previousWeight) };
                    })}
                  >
                    <div className="composer-heading"><div><p className="eyebrow">سجلها بسرعة</p><h3>المجموعة التالية</h3></div><Check size={19} /></div>
                    <div className="composer-inputs">
                      <label><span>كغ</span><input value={setForm.weightKg} onChange={(event) => setSetForm({ ...setForm, weightKg: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); repsInputRef.current?.focus(); } }} type="number" inputMode="decimal" min="0" step="0.5" aria-label="الوزن بالكيلوغرام" /></label>
                      <label><span>تكرار</span><input ref={repsInputRef} value={setForm.reps} onChange={(event) => setSetForm({ ...setForm, reps: event.target.value })} type="number" inputMode="numeric" min="1" aria-label="عدد التكرارات" /></label>
                      <label><span>RIR</span><select value={setForm.rir} onChange={(event) => setSetForm({ ...setForm, rir: event.target.value })} aria-label="RIR">{[0, 1, 2, 3, 4, 5].map((rir) => <option value={rir} key={rir}>{rir}</option>)}</select></label>
                    </div>
                    <div className="composer-footer">
                      <div className="set-kind-toggle" role="group" aria-label="نوع المجموعة"><button type="button" className={setForm.type === "working" ? "selected" : ""} onClick={() => setSetForm({ ...setForm, type: "working" })}>عمل</button><button type="button" className={setForm.type === "warmup" ? "selected" : ""} onClick={() => setSetForm({ ...setForm, type: "warmup" })}>إحماء</button></div>
                      <AppButton type="submit" icon={<Plus size={18} />}>إضافة</AppButton>
                    </div>
                  </form>
                </article>
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
        <div className="section-title"><div><p className="eyebrow">وجبات اليوم</p><h2>ما سجلته</h2></div><button className="text-action" onClick={() => setSheet("meal")}><Plus size={17} /> إضافة</button></div>
        {todayMeals.length === 0 ? <EmptyState icon={<Utensils size={27} />} title="أضف وجبتك الأولى" body="أدخل السعرات والماكروز التي تعرفها، بلا تخمين ولا إلزام بصورة." action={<AppButton onClick={() => setSheet("meal")} icon={<Plus size={18} />}>إضافة وجبة</AppButton>} /> : <div className="meal-list">{todayMeals.map((meal) => <article className="meal-card" key={meal.id}><div className="meal-icon"><Utensils size={19} /></div><div><p>{meal.category} · {formatDate(meal.createdAt)}</p><h2>{meal.name}</h2><span>{formatNumber(meal.protein)} ب · {formatNumber(meal.carbs)} ك · {formatNumber(meal.fat)} د</span></div><strong>{formatNumber(meal.calories)}<small> kcal</small></strong><button className="card-delete" onClick={() => deleteMeal(meal.id)} aria-label={`حذف ${meal.name}`}><Trash2 size={18} /></button></article>)}</div>}
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
      <header className="page-heading"><div><p className="eyebrow">التحسن الحقيقي</p><h1>التقدم</h1></div><BarChart3 className="header-icon" size={24} /></header>
      <section className="progress-overview">
        <article><Dumbbell size={20} /><span>الحصص المكتملة</span><strong>{formatNumber(data.sessions.length)}</strong></article>
        <article><Activity size={20} /><span>مجموعات العمل</span><strong>{formatNumber(data.sessions.reduce((count, session) => count + session.exercises.reduce((sets, exercise) => sets + exercise.sets.filter((set) => set.type === "working").length, 0), 0))}</strong></article>
        <article><Flame size={20} /><span>وجبات مسجلة</span><strong>{formatNumber(data.meals.length)}</strong></article>
      </section>
      <section className="performance-strip" aria-label="أرقام الأداء">
        <article><span>الحجم المسجل</span><strong>{formatNumber(totalLoggedVolume)} <small>كغ</small></strong></article>
        <article><span>أثقل مجموعة عمل</span><strong>{heaviestWorkingSet ? `${formatNumber(heaviestWorkingSet.weightKg)} كغ` : "—"}</strong></article>
      </section>
      {sortedSessions.length > 0 && (
        <section className="section-block">
          <div className="section-title"><div><p className="eyebrow">حصصك المكتملة</p><h2>سجل التمارين</h2></div></div>
          <div className="session-list">
            {sortedSessions.map((session) => (
              <article className="session-card" key={session.id}>
                <div className="session-symbol"><Dumbbell size={20} /></div>
                <div>
                  <h2>{session.name}</h2>
                  <p>{formatDayHeading(session.completedAt)}</p>
                  <span>{formatNumber(session.exercises.length)} تمارين · {formatNumber(countLoggedSets(session.exercises))} مجموعات · {formatNumber(workoutVolume(session.exercises))} كغ</span>
                </div>
                <button className="card-delete" onClick={() => deleteSession(session.id)} aria-label={`حذف حصة ${session.name}`}><Trash2 size={18} /></button>
              </article>
            ))}
          </div>
        </section>
      )}
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
        <Sheet title="إضافة جهاز" onClose={() => setSheet(null)}>
          <form className="form-stack sheet-form equipment-form" onSubmit={saveEquipment}>
            <label className="photo-upload equipment-photo-first">
              <span>صورة الجهاز <em>اختياري</em></span>
              <input type="file" accept="image/*" capture="environment" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setEquipmentForm({ ...equipmentForm, photo: await readFileAsDataUrl(file) }); }} />
              {equipmentForm.photo ? <img src={equipmentForm.photo} alt="معاينة صورة الجهاز" /> : <div><Camera size={25} /><p>التقط صورة أو اختر من الجهاز</p></div>}
            </label>
            <label><span>اسم الجهاز <b>*</b></span><input value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} placeholder="مثال: Chest Press Machine" autoFocus /></label>
            <fieldset className="muscle-fieldset">
              <legend>Muscle Group <b>*</b></legend>
              <div className="muscle-group-grid compact" role="group" aria-label="Equipment muscle group" dir="ltr">
                {MUSCLE_GROUPS.map((muscle) => <button type="button" key={muscle} className={equipmentForm.primaryMuscle === muscle ? "selected" : ""} onClick={() => setEquipmentForm({ ...equipmentForm, primaryMuscle: muscle })} aria-pressed={equipmentForm.primaryMuscle === muscle}>{muscle}</button>)}
              </div>
            </fieldset>
            <label><span>نوع الجهاز</span><select value={equipmentForm.type} onChange={(event) => setEquipmentForm({ ...equipmentForm, type: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
            <label><span>اسم التمرين على الجهاز <em>اختياري</em></span><input dir="ltr" value={equipmentForm.exerciseName} onChange={(event) => setEquipmentForm({ ...equipmentForm, exerciseName: event.target.value })} placeholder="e.g. Seated Chest Press" /></label>
            <label><span>ملاحظات <em>اختياري</em></span><textarea value={equipmentForm.notes} onChange={(event) => setEquipmentForm({ ...equipmentForm, notes: event.target.value })} placeholder="رقم المقعد، إعداد الجهاز، أو أي تلميح مهم" rows={3} /></label>
            <AppButton type="submit" disabled={!equipmentForm.name.trim() || !equipmentForm.primaryMuscle} icon={<Check size={18} />}>حفظ الجهاز</AppButton>
          </form>
        </Sheet>
      )}

      {sheet === "template" && <Sheet title="إنشاء جدولك" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTemplate}><label><span>اسم الجدول <b>*</b></span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="اكتب الاسم الذي يناسبك" autoFocus /></label><fieldset className="exercise-picker"><legend>اختر التمارين <em>اختياري</em></legend>{data.exercises.length === 0 ? <p className="form-hint">أضف جهازًا وتمرينًا أولًا، أو أنشئ الجدول فارغًا وأكمله لاحقًا.</p> : data.exercises.map((exercise) => <label key={exercise.id} className="check-row"><input type="checkbox" checked={templateExercises.includes(exercise.id)} onChange={(event) => setTemplateExercises(event.target.checked ? [...templateExercises, exercise.id] : templateExercises.filter((id) => id !== exercise.id))} /><span>{exercise.name}</span><small>{exercise.primaryMuscle}</small></label>)}</fieldset><AppButton type="submit" icon={<Check size={18} />}>حفظ الجدول</AppButton></form></Sheet>}

      {sheet === "exercise" && (
        <Sheet title={`تسجيل تمرين · ${formatDate(new Date().toISOString())}`} onClose={() => { resetExerciseLogger(); setExerciseSearch(""); setSheet(null); }}>
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
                <div className="filter-rail exercise-filter" role="group" aria-label="Muscle groups" dir="ltr">{(["All", ...MUSCLE_GROUPS] as const).map((group) => <button type="button" key={group} className={selectedMuscleGroup === group ? "selected" : ""} onClick={() => setSelectedMuscleGroup(group)} aria-pressed={selectedMuscleGroup === group}>{group}</button>)}</div>
                <div className="exercise-choice-heading"><span>{selectedMuscleGroup === "All" ? "كل التمارين" : `${selectedMuscleGroup} Exercises`}</span><small>{formatNumber(exercisesInSelectedGroup.length)} تمارين</small></div>
                {exercisesInSelectedGroup.length === 0 ? <div className="library-empty"><Search size={20} /><span>لا توجد تمارين مطابقة</span></div> : (
                  <div className="exercise-picker-list" role="listbox" aria-label="تمارينك">{exercisesInSelectedGroup.map((exercise) => { const alreadyAdded = data.activeWorkout?.exercises.some((item) => item.exerciseId === exercise.id) ?? false; const equipment = data.equipment.find((item) => item.id === exercise.equipmentId); return <button type="button" role="option" aria-selected={false} disabled={alreadyAdded} className={alreadyAdded ? "added" : ""} key={exercise.id} onClick={() => selectExerciseForLogging(exercise.id)}><span className="picker-thumb">{equipment?.photo ? <img src={equipment.photo} alt="" /> : <Dumbbell size={18} />}</span><span><strong>{exercise.name}</strong><small>{muscleGroupFor(exercise.primaryMuscle)} · {exercise.repMin}–{exercise.repMax} reps</small></span>{alreadyAdded ? <Check size={17} /> : <ChevronLeft size={17} />}</button>; })}</div>
                )}
              </>
            ) : (
              <div className="exercise-logger">
                <div className="selected-exercise-strip">
                  <span className="selected-equipment-thumb">{exerciseDraftEquipment?.photo ? <img src={exerciseDraftEquipment.photo} alt="" /> : <Dumbbell size={19} />}</span>
                  <div><strong>{exerciseDraftMeta.name}</strong><small>{muscleGroupFor(exerciseDraftMeta.primaryMuscle)}</small></div>
                  <button type="button" onClick={resetExerciseLogger} aria-label="إلغاء اختيار التمرين"><X size={17} /></button>
                </div>

                <div className="exercise-insights">
                  <article><span>أقوى مستوى</span>{exercisePersonalBest ? <><b>{formatNumber(exercisePersonalBest.reps)} عدة</b><strong dir="ltr">{formatNumber(exercisePersonalBest.weightKg)} kg</strong></> : <small>لا يوجد سجل</small>}</article>
                  <article><span>آخر التمارين</span><b>{formatNumber(exerciseHistory.length)} أيام</b><History size={18} /></article>
                </div>

                <section className="exercise-history-card" aria-label="آخر أداء للتمرين">
                  <div className="history-title"><span><History size={16} /> آخر التمارين</span><small>{exerciseHistory.length ? `${formatNumber(exerciseHistory.length)} أيام` : "أول مرة"}</small></div>
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
                      <div className="stepper-control" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", -1)} aria-label="إنقاص التكرارات"><Minus size={15} /></button><input value={draft.reps} onChange={(event) => updateExerciseDraftSet(draft.id, "reps", event.target.value)} type="number" inputMode="numeric" min="1" aria-label={`تكرارات الجلسة ${index + 1}`} /><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "reps", 1)} aria-label="زيادة التكرارات"><Plus size={15} /></button></div>
                      <div className="stepper-control weight-stepper" dir="ltr"><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", -0.5)} aria-label="إنقاص الوزن"><Minus size={15} /></button><input value={draft.weightKg} onChange={(event) => updateExerciseDraftSet(draft.id, "weightKg", event.target.value)} type="number" inputMode="decimal" min="0" step="0.5" aria-label={`وزن الجلسة ${index + 1}`} /><span>kg</span><button type="button" onClick={() => stepExerciseDraftSet(draft.id, "weightKg", 0.5)} aria-label="زيادة الوزن"><Plus size={15} /></button></div>
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

      {sheet === "set" && <Sheet title="إضافة مجموعة" onClose={() => setSheet(null)}><form className="form-stack sheet-form set-form" onSubmit={saveSet}><div className="set-target"><Dumbbell size={18} /><span>{activeExerciseMeta?.name}</span></div><div className="number-grid"><label><span>الوزن</span><div className="number-with-unit"><input value={setForm.weightKg} onChange={(event) => setSetForm({ ...setForm, weightKg: event.target.value })} type="number" inputMode="decimal" min="0" step="0.5" autoFocus /><b>كغ</b></div></label><label><span>التكرارات</span><input value={setForm.reps} onChange={(event) => setSetForm({ ...setForm, reps: event.target.value })} type="number" inputMode="numeric" min="1" /></label></div><div className="number-grid"><label><span>RIR</span><select value={setForm.rir} onChange={(event) => setSetForm({ ...setForm, rir: event.target.value })}>{[0, 1, 2, 3, 4, 5].map((rir) => <option value={rir} key={rir}>{rir}</option>)}</select></label><label><span>النوع</span><select value={setForm.type} onChange={(event) => setSetForm({ ...setForm, type: event.target.value as "working" | "warmup" })}><option value="working">عمل</option><option value="warmup">إحماء</option></select></label></div><AppButton type="submit" icon={<Check size={18} />}>حفظ المجموعة</AppButton></form></Sheet>}

      {sheet === "meal" && <Sheet title="إضافة وجبة" onClose={() => { setMealError(""); setSheet(null); }}><form className="form-stack sheet-form" onSubmit={saveMeal}><p className="form-hint">اكتب السعرات بأي أرقام: 100 أو ١٠٠. الماكروز اختيارية.</p><label><span>اسم الوجبة <b>*</b></span><input value={mealForm.name} onChange={(event) => { setMealError(""); setMealForm({ ...mealForm, name: event.target.value }); }} placeholder="مثال: دجاج وأرز" autoFocus /></label><label><span>التصنيف</span><select value={mealForm.category} onChange={(event) => setMealForm({ ...mealForm, category: event.target.value })}>{MEAL_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label><span>السعرات <b>*</b></span><div className="number-with-unit"><input value={mealForm.calories} onChange={(event) => { setMealError(""); setMealForm({ ...mealForm, calories: event.target.value }); }} inputMode="decimal" min="0" /><b>kcal</b></div></label><div className="number-grid three"><label><span>بروتين</span><input value={mealForm.protein} onChange={(event) => setMealForm({ ...mealForm, protein: event.target.value })} inputMode="decimal" min="0" /></label><label><span>كربوهيدرات</span><input value={mealForm.carbs} onChange={(event) => setMealForm({ ...mealForm, carbs: event.target.value })} inputMode="decimal" min="0" /></label><label><span>دهون</span><input value={mealForm.fat} onChange={(event) => setMealForm({ ...mealForm, fat: event.target.value })} inputMode="decimal" min="0" /></label></div>{mealError && <p className="form-error" role="alert">{mealError}</p>}<AppButton type="submit" icon={<Check size={18} />}>حفظ الوجبة</AppButton></form></Sheet>}

      {sheet === "target" && <Sheet title="أهدافك اليومية" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTarget}><p className="form-hint">اضبط الأرقام التي تناسبك مباشرة. لا يفرض رست عليك حاسبة أو هدفًا.</p><label><span>السعرات</span><div className="number-with-unit"><input value={targetForm.calories} onChange={(event) => setTargetForm({ ...targetForm, calories: event.target.value })} type="number" inputMode="numeric" min="0" autoFocus /><b>kcal</b></div></label><div className="number-grid three"><label><span>البروتين</span><input value={targetForm.protein} onChange={(event) => setTargetForm({ ...targetForm, protein: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>الكربوهيدرات</span><input value={targetForm.carbs} onChange={(event) => setTargetForm({ ...targetForm, carbs: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>الدهون</span><input value={targetForm.fat} onChange={(event) => setTargetForm({ ...targetForm, fat: event.target.value })} type="number" inputMode="decimal" min="0" /></label></div><AppButton type="submit" icon={<Check size={18} />}>حفظ الأهداف</AppButton></form></Sheet>}
    </main>
  );
}
