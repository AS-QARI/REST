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
  Flame,
  FolderPlus,
  HeartPulse,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Salad,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
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

type Equipment = {
  id: string;
  name: string;
  primaryMuscle: string;
  type: string;
  photo?: string;
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

const LEGACY_GYM_LIBRARY = [
  ["باي بريتشر", "البايسبس", "آلة"],
  ["باي سواعد كيبل", "البايسبس", "كيبل"],
  ["بطات ليق بريس", "السمانة", "آلة"],
  ["تراي اوفر هيد بناتا", "الترايسبس", "آلة"],
  ["تراي بوش داون سايبكس", "الترايسبس", "آلة"],
  ["صدر علوي مسطره", "الصدر", "بار"],
  ["صدر فلاي بناتا", "الصدر", "آلة"],
  ["ظهر ابر تقفيل بناتا", "الظهر", "آلة"],
  ["ظهر تقفيل الاحمر", "الظهر", "آلة"],
  ["ظهر لاتس جانبي بناتا", "الظهر", "آلة"],
  ["فخذ امامي", "الأرجل الأمامية", "آلة"],
  ["فخذ تفتيح", "الألوية", "آلة"],
  ["فخذ تقفيل", "الأرجل الداخلية", "آلة"],
  ["فخذ خلفي", "الأرجل الخلفية", "آلة"],
  ["كتف بريس", "الأكتاف", "آلة"],
  ["كتف جانبي", "الأكتاف", "آلة"],
  ["كتف خلفي بيك ديك", "الأكتاف", "آلة"],
  ["هاك سكوات", "الأرجل الأمامية", "آلة"],
  ["هيب ثرست", "الألوية", "آلة"],
] as const;

function importLegacyGym(data: AppData) {
  const equipmentNames = new Set(data.equipment.map((item) => item.name));
  const exerciseNames = new Set(data.exercises.map((item) => item.name));
  const now = new Date().toISOString();
  const equipment: Equipment[] = [];
  const exercises: Exercise[] = [];

  LEGACY_GYM_LIBRARY.forEach(([name, primaryMuscle, type], index) => {
    const existingEquipment = data.equipment.find((item) => item.name === name);
    const equipmentId = existingEquipment?.id ?? `legacy-equipment-${index + 1}`;
    if (!equipmentNames.has(name)) {
      equipment.push({ id: equipmentId, name, primaryMuscle, type, createdAt: now });
    }
    if (!exerciseNames.has(name)) {
      exercises.push({
        id: `legacy-exercise-${index + 1}`,
        name,
        equipmentId,
        primaryMuscle,
        repMin: 8,
        repMax: 12,
      });
    }
  });

  return equipment.length || exercises.length
    ? { data: { ...data, equipment: [...equipment, ...data.equipment], exercises: [...exercises, ...data.exercises] }, imported: equipment.length }
    : { data, imported: 0 };
}

const MUSCLES = [
  "الصدر",
  "الظهر",
  "الأكتاف",
  "البايسبس",
  "الترايسبس",
  "الأرجل الأمامية",
  "الأرجل الخلفية",
  "الأرجل الداخلية",
  "الألوية",
  "السمانة",
  "البطن",
  "الجسم كامل",
  "أخرى",
];

const EQUIPMENT_TYPES = ["آلة", "كيبل", "أوزان حرة", "بار", "وزن جسم", "أخرى"];
const MEAL_CATEGORIES = ["فطور", "غداء", "عشاء", "سناك", "قبل التمرين", "بعد التمرين"];
const NAVIGATION: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "اليوم", icon: Activity },
  { id: "workout", label: "التمرين", icon: Dumbbell },
  { id: "nutrition", label: "التغذية", icon: Utensils },
  { id: "progress", label: "التقدم", icon: BarChart3 },
];

function uid() {
  return crypto.randomUUID();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
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
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
}

function formatDuration(startedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, "0")}` : `${minutes} د`;
}

function mealEmoji(category: string) {
  const emojis: Record<string, string> = {
    "فطور": "🥣", "غداء": "🍛", "عشاء": "🍽️", "سناك": "🍎",
    "قبل التمرين": "⚡", "بعد التمرين": "💪",
  };
  return emojis[category] ?? "🍴";
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
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem("rest-session") === "active",
  );
  const [tab, setTab] = useState<Tab>("today");
  const [workoutView, setWorkoutView] = useState<WorkoutView>("templates");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [equipmentForm, setEquipmentForm] = useState({
    name: "",
    primaryMuscle: "",
    type: "آلة",
    exerciseName: "",
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
  const [targetForm, setTargetForm] = useState({ calories: "", protein: "", carbs: "", fat: "" });
  const [exerciseToAdd, setExerciseToAdd] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [setForm, setSetForm] = useState({ weightKg: "", reps: "", rir: "2", type: "working" as "working" | "warmup" });

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
      const imported = importLegacyGym(next);
      next = imported.data;
      if (imported.imported) {
        await saveAppData(next);
        if (isSupabaseConfigured()) void saveOwnerSnapshot(next).catch(() => undefined);
        setToast(`تم استيراد ${imported.imported} جهازًا من مكتبتك السابقة`);
      }
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
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, workoutView]);

  const persist = (next: AppData) => {
    setData(next);
    void saveAppData(next);
    if (supabaseConfigured) {
      void saveOwnerSnapshot(next).catch(() => undefined);
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
    () => new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date()),
    [],
  );
  const weekDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index - 2);
      return {
        day: new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(date),
        date: new Intl.DateTimeFormat("ar-SA", { day: "numeric" }).format(date),
        isToday: isToday(date.toISOString()),
      };
    });
  }, []);

  const latestSetFor = (exerciseId: string) => {
    for (const session of data.sessions) {
      const found = session.exercises.find((item) => item.exerciseId === exerciseId)?.sets.at(-1);
      if (found) return found;
    }
    return undefined;
  };

  const activeExercise = data.activeWorkout?.exercises.find((item) => item.exerciseId === selectedExerciseId);
  const activeExerciseMeta = data.exercises.find((item) => item.id === selectedExerciseId);

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
    setToast(template ? `بدأ تمرين ${template.name}` : "بدأ التمرين الفارغ");
  };

  const finishWorkout = () => {
    if (!data.activeWorkout) return;
    const completed: WorkoutSession = { ...data.activeWorkout, completedAt: new Date().toISOString() };
    persist({ ...data, activeWorkout: null, sessions: [completed, ...data.sessions] });
    setWorkoutView("templates");
    setToast("تم حفظ التمرين محليًا");
  };

  const deleteEquipment = (id: string) => {
    if (!window.confirm("حذف هذا الجهاز؟ ستُحذف التمارين المرتبطة به أيضًا.")) return;
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
    setToast("تم حذف الجهاز");
  };

  const deleteTemplate = (id: string) => {
    if (!window.confirm("حذف هذا الجدول؟")) return;
    persist({ ...data, templates: data.templates.filter((template) => template.id !== id) });
    setToast("تم حذف الجدول");
  };

  const deleteMeal = (id: string) => {
    persist({ ...data, meals: data.meals.filter((meal) => meal.id !== id) });
    setToast("تم حذف الوجبة");
  };

  const deleteSession = (id: string) => {
    if (!window.confirm("حذف هذه الحصة من سجلك؟")) return;
    persist({ ...data, sessions: data.sessions.filter((session) => session.id !== id) });
    setToast("تم حذف الحصة");
  };

  const logout = () => {
    sessionStorage.removeItem("rest-session");
    setSignedIn(false);
    setTab("today");
    setWorkoutView("templates");
    setUsername("");
    setPassword("");
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
      sessionStorage.setItem("rest-session", "active");
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
    setEquipmentForm({ name: "", primaryMuscle: "", type: "آلة", exerciseName: "", photo: "" });
    setSheet(null);
    setToast(exercise ? "تم حفظ الجهاز والتمرين" : "تم حفظ الجهاز محليًا");
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
    setToast("تم إنشاء الجدول");
  };

  const addExerciseToWorkout = (event: FormEvent) => {
    event.preventDefault();
    if (!data.activeWorkout || !exerciseToAdd) return;
    if (data.activeWorkout.exercises.some((item) => item.exerciseId === exerciseToAdd)) {
      setToast("التمرين موجود بالفعل في هذه الحصة");
      return;
    }
    const nextActive = {
      ...data.activeWorkout,
      exercises: [...data.activeWorkout.exercises, { exerciseId: exerciseToAdd, sets: [] }],
    };
    persist({ ...data, activeWorkout: nextActive });
    setSelectedExerciseId(exerciseToAdd);
    setExerciseToAdd("");
    setSheet(null);
    setToast("أُضيف التمرين إلى الحصة");
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
    setSetForm({ weightKg: String(weightKg), reps: "", rir: "2", type: "working" });
    setSheet(null);
    setToast("حُفظت المجموعة على هذا الجهاز");
  };

  const saveMeal = (event: FormEvent) => {
    event.preventDefault();
    const calories = Number(mealForm.calories);
    if (!mealForm.name.trim() || !Number.isFinite(calories) || calories < 0) return;
    const meal: Meal = {
      id: uid(),
      name: mealForm.name.trim(),
      category: mealForm.category,
      calories,
      protein: Number(mealForm.protein) || 0,
      carbs: Number(mealForm.carbs) || 0,
      fat: Number(mealForm.fat) || 0,
      createdAt: new Date().toISOString(),
    };
    persist({ ...data, meals: [meal, ...data.meals] });
    setMealForm({ name: "", category: "فطور", calories: "", protein: "", carbs: "", fat: "" });
    setSheet(null);
    setToast("تمت إضافة الوجبة");
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
    setToast("تم تحديث أهداف التغذية");
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
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                inputMode="numeric"
                placeholder="•••"
              />
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
        <div className="daily-heading-row">
          <div>
            <div className="daily-date"><span className="pulse-dot" /> {todayLabel}</div>
            <h1>يومك، <em>أبسط.</em></h1>
          </div>
          <div className="welcome-stat"><strong>{formatNumber(data.sessions.length)}</strong><span>حصصك</span></div>
        </div>
        <div className="week-rail" aria-label="أيام هذا الأسبوع">
          {weekDays.map((day) => <div className={`week-day${day.isToday ? " is-today" : ""}`} key={`${day.day}-${day.date}`}><span>{day.day}</span><b>{day.date}</b></div>)}
        </div>
      </header>

      {data.activeWorkout ? (
        <section className="daily-focus active-hero">
          <div className="hero-icon"><Activity size={24} /></div>
          <div>
            <p>تمرين جارٍ الآن</p>
            <h2>{data.activeWorkout.name}</h2>
            <span>{formatDuration(data.activeWorkout.startedAt)} · {data.activeWorkout.exercises.length} تمارين</span>
          </div>
          <button className="round-action" onClick={() => { setTab("workout"); setWorkoutView("active"); }} aria-label="متابعة التمرين">
            <ChevronLeft size={22} />
          </button>
        </section>
      ) : (
        <section className="daily-focus">
          <div className="focus-number">01</div>
          <div>
            <p>الخطوة التالية</p>
            <h2>سجّل أول مجموعة.</h2>
            <span>افتح التمرين وأضف الوزن والتكرارات فورًا.</span>
          </div>
          <AppButton onClick={() => startWorkout()} icon={<ArrowLeft size={18} />}>ابدأ التمرين</AppButton>
        </section>
      )}

      <section className="section-block today-pulse">
        <div className="section-title">
          <div><p className="eyebrow">ملخص يومك</p><h2>أرقام تقودك</h2></div>
          <div className="sync-badge"><span /> {supabaseConfigured ? "متزامن" : "محفوظ على جهازك"}</div>
        </div>
        <div className="status-grid">
          <article className="status-card status-workout">
            <Dumbbell size={20} />
            <p>الحركة</p>
            <strong>{data.sessions.length ? "تمارينك محفوظة" : "لم تُسجّل بعد"}</strong>
          </article>
          <article className="status-card status-nutrition">
            <Flame size={20} />
            <p>السعرات 🔥</p>
            <strong>{formatNumber(nutrition.calories)}{data.nutritionTarget.calories ? ` / ${formatNumber(data.nutritionTarget.calories)}` : " kcal"}</strong>
          </article>
          <article className="status-card status-protein">
            <Salad size={20} />
            <p>البروتين 💪</p>
            <strong>{formatNumber(nutrition.protein)}{data.nutritionTarget.protein ? ` / ${formatNumber(data.nutritionTarget.protein)} غ` : " غ"}</strong>
          </article>
          <article className="status-card status-recovery">
            <HeartPulse size={20} />
            <p>التعافي ✨</p>
            <strong>{data.sessions.length ? "قيد التقدير" : "بيانات غير كافية"}</strong>
          </article>
        </div>
      </section>

      <section className="section-block compact-section">
        <div className="section-title">
          <div><p className="eyebrow">سجّل بسرعة</p><h2>إضافة سريعة</h2></div>
        </div>
        <div className="quick-actions">
          <button onClick={() => startWorkout()}><Dumbbell size={20} /><span>تمرين الآن</span></button>
          <button onClick={() => setSheet("meal")}><span className="quick-emoji">🍽️</span><span>وجبة</span></button>
          <button onClick={() => { setTab("workout"); setWorkoutView("equipment"); }}><Camera size={20} /><span>المعدات</span></button>
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
            <div><p className="eyebrow">ناديك الحقيقي</p><h2>المعدات</h2></div>
            <button className="text-action" onClick={() => setSheet("equipment")}><Plus size={17} /> إضافة</button>
          </div>
          {data.equipment.length === 0 ? (
            <EmptyState icon={<Camera size={27} />} title="سجّل أول جهاز" body="صوّر الجهاز، اكتب اسمه، واختر العضلة الأساسية. البقية اختيارية." action={<AppButton onClick={() => setSheet("equipment")} icon={<Camera size={18} />}>إضافة جهاز</AppButton>} />
          ) : (
            <div className="equipment-list">
              {data.equipment.map((equipment) => (
                <article className="equipment-card" key={equipment.id}>
                  <div className="equipment-image">
                    {equipment.photo ? <img src={equipment.photo} alt={`صورة ${equipment.name}`} /> : <Dumbbell size={26} />}
                  </div>
                  <div><h2>{equipment.name}</h2><p>{equipment.primaryMuscle} · {equipment.type}</p><span>{data.exercises.filter((item) => item.equipmentId === equipment.id).length} تمارين مرتبطة</span></div>
                  <button className="card-delete" onClick={() => deleteEquipment(equipment.id)} aria-label={`حذف ${equipment.name}`}><Trash2 size={18} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {workoutView === "active" && data.activeWorkout && (
        <section className="live-workout">
          <div className="live-header">
            <button className="icon-button surface" onClick={() => setWorkoutView("templates")} aria-label="العودة لبدء التمرين"><ChevronLeft size={20} /></button>
            <div><p className="eyebrow">حصة جارية · {formatDuration(data.activeWorkout.startedAt)}</p><h1>{data.activeWorkout.name}</h1></div>
            <button className="finish-button" onClick={finishWorkout}>إنهاء</button>
          </div>

          <div className="live-metrics" aria-label="ملخص الحصة الجارية">
            <article><span>تمارين</span><b>{formatNumber(data.activeWorkout.exercises.length)}</b></article>
            <article><span>مجموعات</span><b>{formatNumber(activeSetCount)}</b></article>
            <article><span>حجم العمل</span><b>{formatNumber(activeVolume)} <small>كغ</small></b></article>
          </div>

          {data.activeWorkout.exercises.length === 0 ? (
            <EmptyState icon={<CirclePlus size={27} />} title="ابدأ بإضافة تمرين" body="اختر تمرينًا مرتبطًا بمعدة مسجلة، ثم أضف مجموعاتك بسرعة." action={<AppButton onClick={() => setSheet("exercise")} icon={<Plus size={18} />}>إضافة تمرين</AppButton>} />
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
                  <div className="exercise-log-title"><div><p className="eyebrow">{activeExerciseMeta.primaryMuscle} · هدف {activeExerciseMeta.repMin}–{activeExerciseMeta.repMax}</p><h2>{activeExerciseMeta.name}</h2></div><Dumbbell size={22} /></div>
                  {latestSetFor(activeExerciseMeta.id) ? (
                    <div className="previous-performance"><TrendingUp size={17} /><span>آخر أداء: <b>{latestSetFor(activeExerciseMeta.id)?.weightKg} كغ × {latestSetFor(activeExerciseMeta.id)?.reps}</b></span></div>
                  ) : <div className="previous-performance muted"><Sparkles size={17} /><span>هذه أول مرة تسجل هذا التمرين.</span></div>}
                  <div className="set-history" aria-label="مجموعات التمرين">
                    {activeExercise.sets.length === 0 ? <p className="no-sets">أضف أول مجموعة وستظهر كإنجاز بسيط هنا.</p> : activeExercise.sets.map((set, index) => <article className="set-chip" key={set.id}><span className="set-index">{set.type === "warmup" ? "إحماء" : `مجموعة ${index + 1}`}</span><b dir="ltr">{set.weightKg} <small>كغ</small></b><b dir="ltr">× {set.reps}</b><span>RIR {set.rir ?? "—"}</span></article>)}
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
                      <label><span>كغ</span><input value={setForm.weightKg} onChange={(event) => setSetForm({ ...setForm, weightKg: event.target.value })} type="number" inputMode="decimal" min="0" step="0.5" aria-label="الوزن بالكيلوغرام" /></label>
                      <label><span>تكرار</span><input value={setForm.reps} onChange={(event) => setSetForm({ ...setForm, reps: event.target.value })} type="number" inputMode="numeric" min="1" aria-label="عدد التكرارات" /></label>
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
          <p className="eyebrow">اليوم 🍽️</p>
          <h2>{data.nutritionTarget.calories ? `${formatNumber(Math.max(0, data.nutritionTarget.calories - nutrition.calories))} kcal متبقية` : "حدّد أهدافك أولًا ✨"}</h2>
          <button className="text-action" onClick={openTargetSheet}><Settings2 size={16} /> ضبط الأهداف</button>
        </div>
      </section>
      <div className="macro-grid">
        {[
          ["بروتين 💪", nutrition.protein, data.nutritionTarget.protein, "protein"],
          ["كربوهيدرات ⚡", nutrition.carbs, data.nutritionTarget.carbs, "carbs"],
          ["دهون 🥑", nutrition.fat, data.nutritionTarget.fat, "fat"],
        ].map(([label, current, target, tone]) => <article className="macro-card" key={String(label)}><div><span>{label}</span><b>{formatNumber(Number(current))} غ</b></div><div className="macro-track"><span className={String(tone)} style={{ width: `${Number(target) ? Math.min(100, (Number(current) / Number(target)) * 100) : 0}%` }} /></div><small>{Number(target) ? `من ${formatNumber(Number(target))} غ` : "لا يوجد هدف"}</small></article>)}
      </div>
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">وجبات اليوم</p><h2>ما سجلته</h2></div><button className="text-action" onClick={() => setSheet("meal")}><Plus size={17} /> إضافة</button></div>
        {todayMeals.length === 0 ? <EmptyState icon={<Utensils size={27} />} title="أضف وجبتك الأولى 🍽️" body="أدخل السعرات والماكروز التي تعرفها، بلا تخمين ولا إلزام بصورة." action={<AppButton onClick={() => setSheet("meal")} icon={<Plus size={18} />}>إضافة وجبة</AppButton>} /> : <div className="meal-list">{todayMeals.map((meal) => <article className="meal-card" key={meal.id}><div className="meal-icon emoji-icon">{mealEmoji(meal.category)}</div><div><p>{meal.category} · {formatDate(meal.createdAt)}</p><h2>{meal.name}</h2><span>{formatNumber(meal.protein)} ب · {formatNumber(meal.carbs)} ك · {formatNumber(meal.fat)} د</span></div><strong>{formatNumber(meal.calories)}<small> kcal</small></strong><button className="card-delete" onClick={() => deleteMeal(meal.id)} aria-label={`حذف ${meal.name}`}><Trash2 size={18} /></button></article>)}</div>}
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
      <section className="recovery-card"><div className="recovery-icon"><HeartPulse size={22} /></div><div><p className="eyebrow">التعافي</p><h2>{data.sessions.length ? "قيد التقدير" : "بيانات غير كافية"}</h2><span>{data.sessions.length ? "سيظهر تفسير محافظ عندما تتكرر جلساتك." : "سجّل تمارينك أولًا، ثم أعطِ رست سياقًا كافيًا."}</span></div></section>
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
      <section className="section-block"><div className="section-title"><div><p className="eyebrow">التدرج</p><h2>التوصيات</h2></div></div>{data.sessions.length < 2 ? <EmptyState icon={<TrendingUp size={27} />} title="التوصية تحتاج سجلًا" body="لن يقترح رست زيادة حمل قبل وجود حصتين قابلتين للمقارنة." action={<AppButton variant="secondary" onClick={() => { setTab("workout"); setWorkoutView("templates"); }} icon={<Dumbbell size={18} />}>اذهب للتمرين</AppButton>} /> : <div className="insight-card"><Sparkles size={22} /><div><h2>ستظهر اقتراحات قابلة للشرح هنا</h2><p>تعتمد على الأداء السابق، نطاق التكرار، وRIR — وليس على زيادة تلقائية.</p></div></div>}</section>
    </>
  );

  const content = tab === "today" ? todayContent : tab === "workout" ? workoutContent : tab === "nutrition" ? nutritionContent : progressContent;

  return (
    <main className="app-shell">
      <div className="app-top"><Logo /><button className="icon-button surface" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={18} /></button></div>
      <div className={`page-content view-${tab} view-${workoutView}`}>{content}</div>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {NAVIGATION.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}
      </nav>
      {toast && <div className="toast" role="status"><Check size={17} /> {toast}</div>}

      {sheet === "equipment" && <Sheet title="إضافة جهاز" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveEquipment}><label><span>اسم الجهاز <b>*</b></span><input value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} placeholder="مثال: جهاز ضغط الصدر" autoFocus /></label><label><span>العضلة الأساسية <b>*</b></span><select value={equipmentForm.primaryMuscle} onChange={(event) => setEquipmentForm({ ...equipmentForm, primaryMuscle: event.target.value })}><option value="">اختر العضلة</option>{MUSCLES.map((muscle) => <option value={muscle} key={muscle}>{muscle}</option>)}</select></label><label><span>نوع الجهاز</span><select value={equipmentForm.type} onChange={(event) => setEquipmentForm({ ...equipmentForm, type: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label><label><span>أول تمرين عليه <em>اختياري</em></span><input value={equipmentForm.exerciseName} onChange={(event) => setEquipmentForm({ ...equipmentForm, exerciseName: event.target.value })} placeholder="مثال: ضغط صدر جالس" /></label><label className="photo-upload"><span>صورة الجهاز</span><input type="file" accept="image/*" capture="environment" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setEquipmentForm({ ...equipmentForm, photo: await readFileAsDataUrl(file) }); }} />{equipmentForm.photo ? <img src={equipmentForm.photo} alt="معاينة صورة الجهاز" /> : <div><ImagePlus size={22} /><p>التقط أو اختر صورة</p></div>}</label><AppButton type="submit" icon={<Check size={18} />}>حفظ الجهاز</AppButton></form></Sheet>}

      {sheet === "template" && <Sheet title="إنشاء جدولك" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTemplate}><label><span>اسم الجدول <b>*</b></span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="اكتب الاسم الذي يناسبك" autoFocus /></label><fieldset className="exercise-picker"><legend>اختر التمارين <em>اختياري</em></legend>{data.exercises.length === 0 ? <p className="form-hint">أضف جهازًا وتمرينًا أولًا، أو أنشئ الجدول فارغًا وأكمله لاحقًا.</p> : data.exercises.map((exercise) => <label key={exercise.id} className="check-row"><input type="checkbox" checked={templateExercises.includes(exercise.id)} onChange={(event) => setTemplateExercises(event.target.checked ? [...templateExercises, exercise.id] : templateExercises.filter((id) => id !== exercise.id))} /><span>{exercise.name}</span><small>{exercise.primaryMuscle}</small></label>)}</fieldset><AppButton type="submit" icon={<Check size={18} />}>حفظ الجدول</AppButton></form></Sheet>}

      {sheet === "exercise" && <Sheet title="إضافة تمرين للحصة" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={addExerciseToWorkout}><label><span>التمرين</span><select value={exerciseToAdd} onChange={(event) => setExerciseToAdd(event.target.value)} autoFocus><option value="">اختر تمرينًا</option>{data.exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.primaryMuscle}</option>)}</select></label>{data.exercises.length === 0 && <p className="form-hint">لا توجد تمارين بعد. أضف جهازًا واربط أول تمرين به.</p>}<AppButton type="submit" disabled={!exerciseToAdd} icon={<Plus size={18} />}>إضافة للحصة</AppButton></form></Sheet>}

      {sheet === "set" && <Sheet title="إضافة مجموعة" onClose={() => setSheet(null)}><form className="form-stack sheet-form set-form" onSubmit={saveSet}><div className="set-target"><Dumbbell size={18} /><span>{activeExerciseMeta?.name}</span></div><div className="number-grid"><label><span>الوزن</span><div className="number-with-unit"><input value={setForm.weightKg} onChange={(event) => setSetForm({ ...setForm, weightKg: event.target.value })} type="number" inputMode="decimal" min="0" step="0.5" autoFocus /><b>كغ</b></div></label><label><span>التكرارات</span><input value={setForm.reps} onChange={(event) => setSetForm({ ...setForm, reps: event.target.value })} type="number" inputMode="numeric" min="1" /></label></div><div className="number-grid"><label><span>RIR</span><select value={setForm.rir} onChange={(event) => setSetForm({ ...setForm, rir: event.target.value })}>{[0, 1, 2, 3, 4, 5].map((rir) => <option value={rir} key={rir}>{rir}</option>)}</select></label><label><span>النوع</span><select value={setForm.type} onChange={(event) => setSetForm({ ...setForm, type: event.target.value as "working" | "warmup" })}><option value="working">عمل</option><option value="warmup">إحماء</option></select></label></div><AppButton type="submit" icon={<Check size={18} />}>حفظ المجموعة</AppButton></form></Sheet>}

      {sheet === "meal" && <Sheet title="إضافة وجبة" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveMeal}><label><span>اسم الوجبة <b>*</b></span><input value={mealForm.name} onChange={(event) => setMealForm({ ...mealForm, name: event.target.value })} placeholder="مثال: دجاج وأرز" autoFocus /></label><label><span>التصنيف</span><select value={mealForm.category} onChange={(event) => setMealForm({ ...mealForm, category: event.target.value })}>{MEAL_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label><span>السعرات <b>*</b></span><div className="number-with-unit"><input value={mealForm.calories} onChange={(event) => setMealForm({ ...mealForm, calories: event.target.value })} type="number" inputMode="numeric" min="0" /><b>kcal</b></div></label><div className="number-grid three"><label><span>بروتين</span><input value={mealForm.protein} onChange={(event) => setMealForm({ ...mealForm, protein: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>كربوهيدرات</span><input value={mealForm.carbs} onChange={(event) => setMealForm({ ...mealForm, carbs: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>دهون</span><input value={mealForm.fat} onChange={(event) => setMealForm({ ...mealForm, fat: event.target.value })} type="number" inputMode="decimal" min="0" /></label></div><AppButton type="submit" icon={<Check size={18} />}>حفظ الوجبة</AppButton></form></Sheet>}

      {sheet === "target" && <Sheet title="أهدافك اليومية" onClose={() => setSheet(null)}><form className="form-stack sheet-form" onSubmit={saveTarget}><p className="form-hint">اضبط الأرقام التي تناسبك مباشرة. لا يفرض رست عليك حاسبة أو هدفًا.</p><label><span>السعرات</span><div className="number-with-unit"><input value={targetForm.calories} onChange={(event) => setTargetForm({ ...targetForm, calories: event.target.value })} type="number" inputMode="numeric" min="0" autoFocus /><b>kcal</b></div></label><div className="number-grid three"><label><span>البروتين</span><input value={targetForm.protein} onChange={(event) => setTargetForm({ ...targetForm, protein: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>الكربوهيدرات</span><input value={targetForm.carbs} onChange={(event) => setTargetForm({ ...targetForm, carbs: event.target.value })} type="number" inputMode="decimal" min="0" /></label><label><span>الدهون</span><input value={targetForm.fat} onChange={(event) => setTargetForm({ ...targetForm, fat: event.target.value })} type="number" inputMode="decimal" min="0" /></label></div><AppButton type="submit" icon={<Check size={18} />}>حفظ الأهداف</AppButton></form></Sheet>}
    </main>
  );
}
