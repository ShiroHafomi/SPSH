import * as Lucide from 'lucide-react';

/**
 * Map of Lucide icon names to actual Lucide components.
 * Used to render icons from string names returned by the API.
 * All icons are outline style, 20x20 default size.
 */
const iconMap = {
  // Alerts & Status
  AlertTriangle: Lucide.AlertTriangle,
  AlertCircle: Lucide.AlertCircle,
  CheckCircle: Lucide.CheckCircle,
  Check: Lucide.Check,
  XCircle: Lucide.XCircle,
  X: Lucide.X,
  Info: Lucide.Info,
  Loader: Lucide.Loader,

  // Academic / Education
  BookOpen: Lucide.BookOpen,
  Book: Lucide.Book,
  GraduationCap: Lucide.GraduationCap,
  Award: Lucide.Award,
  Star: Lucide.Star,
  Target: Lucide.Target,
  Trophy: Lucide.Trophy,
  Medal: Lucide.Medal,

  // Data & Analytics
  BarChart: Lucide.BarChart,
  BarChart2: Lucide.BarChart2,
  LineChart: Lucide.LineChart,
  PieChart: Lucide.PieChart,
  TrendingUp: Lucide.TrendingUp,
  TrendingDown: Lucide.TrendingDown,
  Activity: Lucide.Activity,
  Database: Lucide.Database,
  Table: Lucide.Table,

  // Time & Schedule
  Clock: Lucide.Clock,
  Calendar: Lucide.Calendar,
  CalendarDays: Lucide.CalendarDays,
  RefreshCw: Lucide.RefreshCw,
  RotateCcw: Lucide.RotateCcw,

  // User & People
  User: Lucide.User,
  Users: Lucide.Users,
  UserPlus: Lucide.UserPlus,
  UserMinus: Lucide.UserMinus,
  UserCheck: Lucide.UserCheck,

  // Actions
  Plus: Lucide.Plus,
  Minus: Lucide.Minus,
  Edit: Lucide.Edit,
  Edit2: Lucide.Edit2,
  Trash2: Lucide.Trash2,
  Save: Lucide.Save,
  Download: Lucide.Download,
  Upload: Lucide.Upload,
  Copy: Lucide.Copy,
  Share: Lucide.Share,
  Search: Lucide.Search,
  Filter: Lucide.Filter,
  Settings: Lucide.Settings,

  // Navigation
  Menu: Lucide.Menu,
  ArrowLeft: Lucide.ArrowLeft,
  ArrowRight: Lucide.ArrowRight,
  ChevronDown: Lucide.ChevronDown,
  ChevronUp: Lucide.ChevronUp,
  ChevronLeft: Lucide.ChevronLeft,
  ChevronRight: Lucide.ChevronRight,
  Home: Lucide.Home,
  ExternalLink: Lucide.ExternalLink,

  // Communication
  Mail: Lucide.Mail,
  MessageCircle: Lucide.MessageCircle,
  MessageSquare: Lucide.MessageSquare,
  Phone: Lucide.Phone,
  Send: Lucide.Send,
  Bell: Lucide.Bell,

  // Media
  Image: Lucide.Image,
  Video: Lucide.Video,
  Play: Lucide.Play,
  Pause: Lucide.Pause,
  Volume2: Lucide.Volume2,
  Mic: Lucide.Mic,
  Camera: Lucide.Camera,

  // Commerce
  ShoppingCart: Lucide.ShoppingCart,
  ShoppingBag: Lucide.ShoppingBag,
  CreditCard: Lucide.CreditCard,
  DollarSign: Lucide.DollarSign,
  Tag: Lucide.Tag,
  Gift: Lucide.Gift,
  Percent: Lucide.Percent,

  // Files
  File: Lucide.File,
  FileText: Lucide.FileText,
  Folder: Lucide.Folder,
  FolderOpen: Lucide.FolderOpen,
  Paperclip: Lucide.Paperclip,
  Link: Lucide.Link,
  Clipboard: Lucide.Clipboard,

  // Layout
  Grid: Lucide.Grid,
  List: Lucide.List,
  Columns: Lucide.Columns,
  Maximize: Lucide.Maximize,
  Minimize: Lucide.Minimize,
  Sidebar: Lucide.Sidebar,

  // Social
  Heart: Lucide.Heart,
  ThumbsUp: Lucide.ThumbsUp,
  ThumbsDown: Lucide.ThumbsDown,
  Bookmark: Lucide.Bookmark,
  Flag: Lucide.Flag,

  // Device
  Smartphone: Lucide.Smartphone,
  Tablet: Lucide.Tablet,
  Monitor: Lucide.Monitor,
  Laptop: Lucide.Laptop,
  Printer: Lucide.Printer,

  // Security
  Lock: Lucide.Lock,
  Unlock: Lucide.Unlock,
  Shield: Lucide.Shield,
  Key: Lucide.Key,
  Eye: Lucide.Eye,
  EyeOff: Lucide.EyeOff,

  // Location
  MapPin: Lucide.MapPin,
  Map: Lucide.Map,
  Navigation: Lucide.Navigation,
  Globe: Lucide.Globe,

  // Work / Study
  Briefcase: Lucide.Briefcase,
  WifiOff: Lucide.WifiOff,
  Wifi: Lucide.Wifi,
  Moon: Lucide.Moon,
  Sun: Lucide.Sun,
  Coffee: Lucide.Coffee,
  Brain: Lucide.Brain,
  Lightbulb: Lucide.Lightbulb,
  Zap: Lucide.Zap,
};

/**
 * Render a Lucide icon by name.
 * @param {string} name - Icon name from iconMap
 * @param {object} props - Additional props (size, className, strokeWidth, etc.)
 * @returns {JSX.Element|null} Lucide icon component or null if not found
 */
export function renderIcon(name, props = {}) {
  const IconComponent = iconMap[name];
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in iconMap, falling back to HelpCircle`);
    return <Lucide.HelpCircle {...props} />;
  }
  return <IconComponent {...props} />;
}

/**
 * Get icon component by name (for direct usage)
 * @param {string} name - Icon name
 * @returns {React.ComponentType|null}
 */
export function getIcon(name) {
  return iconMap[name] || null;
}

export default iconMap;