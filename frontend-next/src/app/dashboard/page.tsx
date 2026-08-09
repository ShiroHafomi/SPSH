'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  ArrowRight,
  Clock,
  Target,
  Brain,
  Award,
  BookOpen,
  Moon,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Navbar } from '@/components/navbar';
import Cookies from 'js-cookie';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

interface DashboardStats {
  totalStudents: number;
  avgFinalScore: number;
  passRate: number;
  atRiskCount: number;
  gradeDistribution: { grade: string; count: number }[];
  recentActivity: { action: string; user: string; time: string }[];
}

interface ChartData {
  kpis: any[];
  charts: ChartConfig[];
  chartConfig: any;
}

interface ChartConfig {
  type: 'bar' | 'scatter' | 'histogram';
  title: string;
  labels?: string[];
  data?: number[];
  xLabel?: string;
  yLabel?: string;
  [key: string]: any;
}

/** Personal profile returned by GET /api/student/me/profile (student role only). */
interface StudentProfile {
  student: {
    id: number;
    student_id: number;
    name: string;
    email: string;
    gender: string;
    age: number;
    study_hours_per_day: number;
    attendance_percent: number;
    sleep_hours: number;
    previous_gpa: number;
    parental_education: string;
    internet_access: string;
    extracurricular: string;
    part_time_job: string;
    final_score: number;
    grade: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  percentiles: {
    final_score: number;
    attendance_percent: number;
    study_hours_per_day: number;
    sleep_hours: number;
    previous_gpa: number;
  };
  riskAlerts: RiskAlert[];
}

interface RiskAlert {
  type: 'danger' | 'warning' | 'info';
  icon: string;
  title: string;
  message: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Student role only — own personal academic record (Role 3 scope).
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileError, setProfileError] = useState('');

  const userRole = Cookies.get('user_role') || 'student';
  const userName = Cookies.get('user_name') || 'User';
  const isStudent = userRole === 'student';

  useEffect(() => {
    if (isStudent) fetchStudentProfile();
    else fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data.stats);
      setChartData(data.chartData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentProfile = async () => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/student/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch profile');
      }
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 w-48 bg-muted rounded" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 bg-card border rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchStats}>Retry</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {isStudent ? 'My Dashboard' : 'Dashboard'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {userName}!{' '}
              {isStudent
                ? "Here's your personal academic overview."
                : "Here's an overview of the system."}
            </p>
          </div>

          {isStudent ? (
            <>
              {/* ─────────────────────────────────────────────
                  ROLE 3 — STUDENT PORTAL: personal record only.
                  No global class analytics (per scope rules).
                  ───────────────────────────────────────────── */}

              {/* Personal Academic Scorecard */}
              {profile ? (
                <>
                  {/* Score tiles */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Final Score</CardTitle>
                        <Award className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-primary">
                          {profile.student.final_score?.toFixed(1) || 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">out of 100</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Grade</CardTitle>
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <Badge
                          variant={getGradeVariant(profile.student.grade || '')}
                          className="text-lg px-3 py-1"
                        >
                          {profile.student.grade || 'N/A'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-2">Current standing</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Class Percentile</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {profile.percentiles?.final_score || 0}%
                        </div>
                        <p className="text-xs text-muted-foreground">based on final score</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Previous GPA</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {profile.student.previous_gpa?.toFixed(2) || 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">out of 4.0</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Habit overview */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        Study Habits Overview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Attendance</span>
                            <span>
                              {(profile.student.attendance_percent || 0).toFixed(1)}%
                              <span className="text-muted-foreground ml-1">
                                · {profile.percentiles?.attendance_percent || 0}%ile
                              </span>
                            </span>
                          </div>
                          <Progress value={profile.student.attendance_percent || 0} className="h-3" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Study Hours/Day</span>
                            <span>
                              {(profile.student.study_hours_per_day || 0).toFixed(1)} hrs
                              <span className="text-muted-foreground ml-1">
                                · {profile.percentiles?.study_hours_per_day || 0}%ile
                              </span>
                            </span>
                          </div>
                          <Progress
                            value={Math.min(((profile.student.study_hours_per_day || 0) / 12) * 100, 100)}
                            className="h-3"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Sleep Hours</span>
                            <span>
                              {(profile.student.sleep_hours || 0).toFixed(1)} hrs
                              <span className="text-muted-foreground ml-1">
                                · {profile.percentiles?.sleep_hours || 0}%ile
                              </span>
                            </span>
                          </div>
                          <Progress
                            value={Math.min(((profile.student.sleep_hours || 0) / 10) * 100, 100)}
                            className="h-3"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Previous GPA</span>
                            <span>
                              {(profile.student.previous_gpa || 0).toFixed(2)}/4.0
                              <span className="text-muted-foreground ml-1">
                                · {profile.percentiles?.previous_gpa || 0}%ile
                              </span>
                            </span>
                          </div>
                          <Progress
                            value={Math.min(((profile.student.previous_gpa || 0) / 4) * 100, 100)}
                            className="h-3"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : profileError ? (
                <Card className="mb-8 border-l-4 border-yellow-500">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium">No academic record linked</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profileError} Please contact your administrator to link your student
                          record so your scorecard and alerts can appear here.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Personal Risk & Alert Banner */}
              {profile?.riskAlerts && profile.riskAlerts.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-3">Personal Alerts</h2>
                  {profile.riskAlerts.map((alert, index) => (
                    <Card
                      key={index}
                      className={`mb-3 border-l-4 ${
                        alert.type === 'danger'
                          ? 'border-destructive'
                          : alert.type === 'warning'
                            ? 'border-yellow-500'
                            : 'border-blue-500'
                      }`}
                    >
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                          {renderRiskIcon(alert.icon, alert.type)}
                          <div>
                            <h4 className="font-medium">{alert.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Student quick actions */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                <QuickActionCard
                  href="/student/profile"
                  title="My Profile"
                  description="View my academic scorecard"
                  icon={GraduationCap}
                  cta="View Profile"
                />
                <QuickActionCard
                  href="/student/simulator"
                  title="What-If Simulator"
                  description="Predict score changes"
                  icon={Target}
                  cta="Open Simulator"
                />
                <QuickActionCard
                  href="/student/advisor"
                  title="AI Advisor"
                  description="Personalized recommendations"
                  icon={Brain}
                  cta="Get Advice"
                />
              </div>

              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Want the full breakdown?{' '}
                    <Link href="/student/profile" className="text-primary font-medium hover:underline">
                      View my academic profile →
                    </Link>
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* ─────────────────────────────────────────────
                  ROLE 1 (Admin) & ROLE 2 (Teacher): class/system
                  analytics. Students never reach this branch.
                  ───────────────────────────────────────────── */}

              {/* KPI Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.totalStudents || 0}</div>
                    <p className="text-xs text-muted-foreground">Active students in system</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Final Score</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.avgFinalScore?.toFixed(1) || 'N/A'}</div>
                    <p className="text-xs text-muted-foreground">Class average performance</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.passRate?.toFixed(1) || 'N/A'}%</div>
                    <p className="text-xs text-muted-foreground">Students passing (Grade A-D)</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">At Risk</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{stats?.atRiskCount || 0}</div>
                    <p className="text-xs text-muted-foreground">Students needing attention</p>
                  </CardContent>
                </Card>
              </div>

              {/* Role-specific quick actions (now navigable) */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                {userRole === 'admin' && (
                  <>
                    <QuickActionCard
                      href="/admin/users"
                      title="User Management"
                      description="Manage teachers and students"
                      icon={Users}
                      cta="View Users"
                    />
                    <QuickActionCard
                      href="/admin/analytics"
                      title="System Analytics"
                      description="System-wide performance metrics"
                      icon={BarChart2}
                      cta="View Analytics"
                    />
                    <QuickActionCard
                      href="/admin/at-risk"
                      title="At-Risk Students"
                      description="Early warning system"
                      icon={AlertTriangle}
                      cta="View At-Risk"
                      accent="destructive"
                    />
                  </>
                )}

                {userRole === 'teacher' && (
                  <>
                    <QuickActionCard
                      href="/teacher/analytics"
                      title="Class Analytics"
                      description="Performance & habits correlation"
                      icon={BarChart2}
                      cta="View Analytics"
                    />
                    <QuickActionCard
                      href="/teacher/students"
                      title="Students"
                      description="Manage student records"
                      icon={GraduationCap}
                      cta="View Students"
                    />
                    <QuickActionCard
                      href="/teacher/ai-counsel"
                      title="AI Counsel"
                      description="Generate intervention notes"
                      icon={Brain}
                      cta="Open AI Counsel"
                    />
                  </>
                )}
              </div>

              {/* Grade Distribution Chart */}
              {stats?.gradeDistribution && stats.gradeDistribution.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Grade Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {stats.gradeDistribution.map((item) => (
                        <Badge key={item.grade} variant={getGradeVariant(item.grade)} className="text-base px-4 py-2">
                          {item.grade}: {item.count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity */}
              {stats?.recentActivity && stats.recentActivity.length > 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.recentActivity.slice(0, 5).map((activity, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{activity.action}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{activity.user}</p>
                            <p className="text-xs text-muted-foreground">{activity.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts Section */}
              {chartData?.charts && chartData.charts.length > 0 && (
                <>
                  {/* Study Hours vs Final Score - Scatter Plot (Enhanced) */}
                  {chartData.charts.map((chart, index) => (
                    <ChartCard key={index} chart={chart} chartConfig={chartData.chartConfig} />
                  ))}

                  {/* Additional Chart: Grade Distribution Pie Chart */}
                  {stats?.gradeDistribution && stats.gradeDistribution.length > 0 && (
                    <Card className="mt-6">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <PieChart className="h-5 w-5" />
                          Grade Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={stats.gradeDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                fill="#8884d8"
                                paddingAngle={2}
                                dataKey="count"
                                nameKey="grade"
                                label={({ grade, percent }) => `${grade} ${(percent * 100).toFixed(0)}%`}
                                labelLine={false}
                              >
                                {stats.gradeDistribution.map((entry, i) => (
                                  <Cell key={`cell-${i}`} fill={getGradeColor(entry.grade)} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => `${value} students`} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Additional Chart: Average Score by Gender/Category (Bar Chart) */}
                  {chartData?.chartConfig?.meta?.categoryColumns && chartData.chartConfig.meta.categoryColumns.length > 0 && (
                    <Card className="mt-6">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BarChart2 className="h-5 w-5" />
                          Average Score by Category
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData.charts
                                .filter(c => c.type === 'bar' && c.labels && c.data)
                                .flatMap((c, ci) => c.labels!.map((label, i) => ({
                                  category: label,
                                  value: c.data![i],
                                  chartIdx: ci,
                                })))}
                              layout="horizontal"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tickFormatter={v => v.toFixed(1)} />
                              <YAxis type="category" dataKey="category" width={120} />
                              <Tooltip formatter={(value: number) => [`${value.toFixed(1)}`, 'Avg Score']} />
                              <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function getGradeVariant(grade: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (grade) {
    case 'A': return 'success';
    case 'B': return 'default';
    case 'C': return 'warning';
    case 'D': return 'secondary';
    case 'F': return 'destructive';
    default: return 'outline';
  }
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#22c55e';
    case 'B': return '#3b82f6';
    case 'C': return '#f59e0b';
    case 'D': return '#6b7280';
    case 'F': return '#ef4444';
    default: return '#94a3b8';
  }
}

/** Render the icon referenced by a risk alert (server returns the icon name as a string). */
function renderRiskIcon(icon: string, type: 'danger' | 'warning' | 'info') {
  const base = 'h-5 w-5 flex-shrink-0 mt-0.5';
  const tone =
    type === 'danger'
      ? 'text-destructive'
      : type === 'warning'
        ? 'text-yellow-500'
        : 'text-blue-500';
  switch (icon) {
    case 'AlertTriangle':
      return <AlertTriangle className={`${base} ${tone}`} />;
    case 'CheckCircle':
      return <CheckCircle className={`${base} text-green-500`} />;
    case 'XCircle':
      return <XCircle className={`${base} ${tone}`} />;
    case 'TrendingUp':
      return <TrendingUp className={`${base} text-green-500`} />;
    case 'Target':
      return <Target className={`${base} text-primary`} />;
    case 'Clock':
      return <Clock className={`${base} text-yellow-500`} />;
    case 'BookOpen':
      return <BookOpen className={`${base} text-blue-500`} />;
    case 'Moon':
      return <Moon className={`${base} text-purple-500`} />;
    default:
      return <AlertTriangle className={`${base} ${tone}`} />;
  }
}

interface QuickActionCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  cta: string;
  accent?: 'primary' | 'destructive';
}

/** A clickable card linking to a role-specific route. */
function QuickActionCard({ href, title, description, icon: Icon, cta, accent = 'primary' }: QuickActionCardProps) {
  const destructive = accent === 'destructive';
  return (
    <Link href={href} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Icon className={`h-10 w-10 ${destructive ? 'text-destructive/50' : 'text-primary/50'}`} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className={`text-sm font-medium ${destructive ? 'text-destructive' : 'text-primary'}`}>
              {cta}
            </span>
            <ArrowRight className={`h-4 w-4 ${destructive ? 'text-destructive' : 'text-primary'}`} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface ChartCardProps {
  chart: ChartConfig;
  chartConfig: any;
}

function ChartCard({ chart, chartConfig }: ChartCardProps) {
  if (chart.type === 'scatter' && chart.data) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {chart.title || 'Study Hours vs Final Score'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={chart.xLabel || 'X'}
                  unit="hrs"
                  tickFormatter={v => v.toFixed(1)}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={chart.yLabel || 'Y'}
                  unit="/100"
                  tickFormatter={v => v.toFixed(0)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'x' ? value.toFixed(1) : value.toFixed(1),
                    name === 'x' ? 'Study Hours' : 'Final Score',
                  ]}
                  labelFormatter={(_, payload) => {
                    const item = payload[0];
                    return item ? `Study Hours: ${item.value?.x?.toFixed(1)}, Score: ${item.value?.y?.toFixed(1)}` : '';
                  }}
                />
                <Scatter
                  name="Students"
                  data={chart.data}
                  fill="#8884d8"
                  stroke="#8884d8"
                  shape="circle"
                  size={6}
                />
                {/* Trend line reference */}
                <Scatter
                  name="Trend"
                  data={(function() {
                    const sorted = chart.data.slice().sort((a: any, b: any) => a.x - b.x);
                    const avg = sorted.reduce((s: number, p: any) => s + p.y, 0) / sorted.length;
                    return sorted.map((d: any) => ({ x: d.x, y: avg }));
                  })()}
                  fill="transparent"
                  stroke="#22c55e"
                  strokeDasharray="5 5"
                  shape={(props: any) => <Line {...props} type="linear" />}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-sm text-muted-foreground mt-3 text-center">
            Each dot represents a student. Hover for details. Green dashed line shows class average.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (chart.type === 'histogram' && chart.labels && chart.data) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            {chart.title || 'Score Distribution'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.labels.map((label, i) => ({ label, value: chart.data[i] }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" name={chart.xLabel || 'Score Range'} />
                <YAxis name="Count" />
                <Tooltip formatter={(value: number) => [`${value}`, 'Students']} />
                <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chart.type === 'bar' && chart.labels && chart.data) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            {chart.title || 'Average Score'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.labels.map((label, i) => ({ category: label, value: chart.data[i] }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" name={chart.yLabel || 'Avg Score'} />
                <YAxis type="category" dataKey="category" width={120} name={chart.xLabel || 'Category'} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(1)}`, 'Avg Score']} />
                <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
