// The data model. Everything is stored in metric, with ISO dates (YYYY-MM-DD).
// See docs/data-schema.md for the public description of this format.

export type ISODate = string;
export type MonthDay = string; // 'MM-DD'
export type Id = string;

export type Hemisphere = 'N' | 'S';
export type Direction = 'N' | 'E' | 'S' | 'W';

export interface Climate {
  hemisphere: Hemisphere;
  lastFrost: MonthDay;
  firstFrost: MonthDay;
  source: string;
  monthlyMeanC?: number[];
  zone?: string;
  userEdited?: boolean;
}

export interface Site {
  id: Id;
  name: string;
  location: { lat: number; lon: number; label: string };
  climate: Climate;
  units: 'metric' | 'imperial';
  locale: string;
  weekStart?: 0 | 1;
}

export type PlotType = 'allotment' | 'garden' | 'raised-beds' | 'greenhouse' | 'containers' | 'field';

export interface Plot {
  id: Id;
  siteId: Id;
  name: string;
  type: PlotType;
  widthM: number;
  lengthM: number;
  topDirection: Direction;
  startDate?: ISODate;
  endDate?: ISODate;
  notes?: string;
}

/** [x, y, width, height] in metres from the plot's top-left corner as drawn. */
export type Rect = [number, number, number, number];
export type Point = [number, number];

export interface Shape {
  rect?: Rect;
  line?: Point[];
  polygon?: Point[];
}

export type FeatureType =
  | 'fence' | 'wall' | 'hedge' | 'tree' | 'path' | 'shed' | 'greenhouse' | 'polytunnel'
  | 'coldframe' | 'water' | 'tap' | 'compost' | 'seating' | 'tools' | 'other';

export interface Feature {
  id: Id;
  plotId: Id;
  type: FeatureType;
  label: string;
  shape: Shape;
  side?: Direction;
  fromDate?: ISODate;
  toDate?: ISODate;
  props?: Record<string, unknown>;
}

export type AreaKind = 'bed' | 'section' | 'rows' | 'grid' | 'container';
export type Protection = 'none' | 'cloche' | 'coldframe' | 'greenhouse' | 'polytunnel' | 'heated';

export interface Area {
  id: Id;
  plotId: Id;
  parentId?: Id;
  kind: AreaKind;
  name: string;
  shape: Shape;
  rows?: number;
  /** Rows divide the area across x (default, rows run top to bottom) or across y. */
  rowsAxis?: 'x' | 'y';
  gridCm?: number;
  volumeL?: number;
  protection?: Protection;
  perennial?: boolean;
  /** Colour for a perennial area when no planting is recorded in it. */
  fill?: Category;
  fromDate?: ISODate;
  toDate?: ISODate;
}

export type Category =
  | 'allium' | 'leaf' | 'brassica' | 'legume' | 'root' | 'fruiting' | 'cucurbit' | 'herb' | 'fruit' | 'flower';

export type Hardiness = 'tender' | 'half-hardy' | 'hardy';
export type Anchor = 'lastFrost' | 'firstFrost' | 'soilTemp' | 'dayLength' | 'fixed';
export type TimingKind = 'sowIndoor' | 'sowOutdoor' | 'plantOut' | 'overwinter' | 'harvest';

export interface TimingRule {
  kind: TimingKind;
  anchor: Anchor;
  fromOffsetDays?: number;
  /** Anchor for the end of the window when it differs from the start, e.g. sow from last frost until 10 weeks before first frost. */
  toAnchor?: Anchor;
  toOffsetDays?: number;
  /** soilTemp: °C; dayLength: hours; fixed: unused. */
  threshold?: number;
  /** fixed anchor: month-day, adjusted for hemisphere. */
  fixedFrom?: MonthDay;
  fixedTo?: MonthDay;
  protectionShiftDays?: number;
}

export type Care = 'support' | 'net' | 'mesh' | 'fleece' | 'earth-up' | 'thin' | 'pinch-out' | 'cure' | 'chit';

export interface Source { field?: string; note: string; url?: string }

export interface Crop {
  id: Id;
  names: Record<string, string[]>;
  family: string;
  species: string;
  category: Category;
  lifecycle: 'annual' | 'biennial' | 'perennial';
  hardiness: Hardiness;
  minTempC?: number;
  timing: TimingRule[];
  /** Days in module before planting out. */
  moduleDays?: number;
  /** Most days a plug can sit in its module before it suffers. */
  maxModuleDays?: number;
  daysToHarvest?: number;
  harvestWindowDays?: number;
  frostFreeDaysNeeded?: number;
  dayLength?: 'short' | 'long' | 'neutral';
  propagation?: {
    seedsPerModule?: number;
    moduleSize?: string;
    germTempC?: number;
    bottomHeat?: boolean;
    light?: string;
  };
  spacing?: { inRowCm?: number; betweenRowsCm?: number; gridCm?: number; perContainerL?: number };
  seedSaving?: {
    pollination?: 'self' | 'insect' | 'wind';
    crosses?: 'rarely' | 'sometimes' | 'readily';
    isolationM?: number;
    minPlants?: number;
  };
  seedLifeYears?: number;
  rotationGroup: string;
  /** Jobs this crop usually needs, used to generate tasks. */
  care?: Care[];
  pests?: string[];
  varieties?: Variety[];
  sources?: Source[];
  notes?: string;
}

export interface Variety {
  id: Id;
  cropId: Id;
  name: string;
  seedType: 'OP' | 'F1' | 'unknown';
  overrides?: Partial<Omit<Crop, 'id' | 'varieties'>>;
  notes?: string;
}

export type StockKind = 'seed' | 'bulb' | 'clove' | 'set' | 'tuber' | 'crown' | 'plant' | 'cutting';
export type StockSource = 'bought' | 'saved' | 'gift' | 'swap' | 'unknown';
export type StockStatus = 'plenty' | 'low' | 'used';

export interface StockLot {
  id: Id;
  varietyId: Id;
  kind: StockKind;
  source: StockSource;
  supplier?: string;
  organic?: boolean;
  acquired?: ISODate;
  useBy?: ISODate;
  storage?: string;
  quantity?: number;
  unit?: string;
  status: StockStatus;
  link?: string;
  parentPlantingId?: Id;
  germTests: { date: ISODate; sown: number; up: number }[];
  notes?: string;
}

export interface Window { from: ISODate; to: ISODate }

export type WindowKey = 'sow' | 'potOn' | 'hardenOff' | 'plantOut' | 'harvest' | 'clear';
export type Windows = Partial<Record<WindowKey, Window>>;

export type PlantingStatus = 'planned' | 'sown' | 'growing' | 'harvesting' | 'cleared' | 'failed';
export type Agreement = 'draft' | 'agreed';
export type QtyUnit = 'plants' | 'plugs' | 'clumps' | 'cloves' | 'sets' | 'tubers' | 'metres' | 'seeds';
export type Method = 'module' | 'direct' | 'bought';

export interface Planting {
  id: Id;
  plotId: Id;
  areaId: Id;
  rows?: number[];
  cells?: number[];
  varietyId: Id;
  stockLotId?: Id;
  qty?: number;
  qtyUnit?: QtyUnit;
  perClump?: number;
  spacingCm?: number;
  method?: Method;
  propagationSpaceId?: Id;
  moduleType?: string;
  seedsPerCell?: number;
  bottomHeat?: boolean;
  windows: Windows;
  followsPlantingId?: Id;
  /** Days from the predecessor's clear.from to this planting's plantOut.from. */
  followGapDays?: number;
  interplanted?: boolean;
  purpose: 'eat' | 'seed' | 'both';
  status: PlantingStatus;
  agreement: Agreement;
  actual: { sown?: ISODate; plantedOut?: ISODate; firstHarvest?: ISODate; cleared?: ISODate };
  notes?: string;
  /** Import that brought this planting in as a draft, if any. */
  importId?: Id;
}

export type TaskPlace = 'plot' | 'home' | 'propagation' | 'admin';
export type TaskType = 'sow' | 'plant' | 'harvest' | 'order' | 'job';
export type TaskStatus = 'todo' | 'done' | 'skipped';

export interface Recurrence { every: number; unit: 'day' | 'week' | 'month' | 'year'; until?: ISODate }

export interface Task {
  id: Id;
  plotId?: Id;
  areaId?: Id;
  plantingId?: Id;
  place: TaskPlace;
  type: TaskType;
  title: string;
  details?: string;
  window: Window;
  qty?: string;
  recurrence?: Recurrence;
  status: TaskStatus;
  doneOn?: ISODate;
  agreement: Agreement;
  notes?: string;
  importId?: Id;
}

/** Completion state for tasks generated from plantings, keyed by generated task id. */
export interface TaskState { id: string; status: TaskStatus; doneOn?: ISODate; notes?: string }

export interface PropSpace {
  id: Id;
  siteId: Id;
  name: string;
  capacity: number;
  unit: 'trays' | 'modules';
  lights: boolean;
  bottomHeat: boolean;
  tempC?: number;
  /** Modules per tray, used to convert module demand into trays. */
  modulesPerTray?: number;
}

export interface Reservation { id: Id; propSpaceId: Id; label: string; window: Window; amount: number }

export type EntryKind = 'note' | 'photo' | 'harvest' | 'problem' | 'store' | 'review';

export interface Entry {
  id: Id;
  date: ISODate;
  plotId?: Id;
  areaId?: Id;
  plantingId?: Id;
  kind: EntryKind;
  text?: string;
  grams?: number;
  count?: number;
  problem?: { name: string; severity: 1 | 2 | 3 };
  media?: string[];
}

export interface Change { kind: 'add' | 'update' | 'remove'; store: string; id: Id; before?: unknown; after?: unknown }

export interface Import {
  id: Id;
  createdAt: string;
  source: 'file' | 'link';
  from?: string;
  changes: Change[];
  status: 'open' | 'accepted' | 'rejected';
}

export interface Settings {
  id: 'settings';
  activeSiteId?: Id;
  activePlotId?: Id;
  theme: 'system' | 'light' | 'dark';
  rotationYears: number;
  monthRange: { mode: 'auto' } | { mode: 'fixed'; from: string; months: number };
  dateFormat: 'dmy' | 'mdy' | 'ymd';
}

export interface Meta { id: 'meta'; schemaVersion: number; appVersion: string; lastBackupAt?: string; createdAt: string }

/** Everything the app stores. A backup file is this shape plus a format marker. */
export interface Dataset {
  sites: Site[];
  plots: Plot[];
  features: Feature[];
  areas: Area[];
  plantings: Planting[];
  tasks: Task[];
  taskStates: TaskState[];
  stock: StockLot[];
  /** User-created crops and user edits to library crops (merged over the bundled library). */
  cropOverrides: Crop[];
  varieties: Variety[];
  propSpaces: PropSpace[];
  reservations: Reservation[];
  entries: Entry[];
  imports: Import[];
  settings: Settings;
  meta: Meta;
}

export const SCHEMA_VERSION = 1;
