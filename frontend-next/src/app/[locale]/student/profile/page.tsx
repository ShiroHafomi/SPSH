'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Target, AlertTriangle, TrendingUp, CheckCircle, XCircle, User, Clock, BookOpen, Moon, Calendar, Award, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Sector,
} from 'recharts';
import Cookies from 'js-cookie';

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
  riskAlerts: Array<{
    type: 'danger' | 'warning' | 'info';
    icon: string;
    title: string;
    message: string;
  }>;
}

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/student/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevel = (student: StudentProfile['student']) => {
    let riskFactors = 0;
    if (student.attendance_percent < 75) riskFactors++;
    if (student.sleep_hours < 5.5) riskFactors++;
    if (student.previous_gpa < 2.5) riskFactors++;
    if (student.study_hours_per_day < 2) riskFactors++;

    if (riskFactors >= 3) return 'high';
    if (riskFactors >= 1) return 'medium';
    return 'low';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto animate-pulse space-y-6">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-card border rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Failed to load profile</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={fetchProfile} className="mt-4">Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const student = profile?.student;
  const percentiles = profile?.percentiles;
  const riskAlerts = profile?.riskAlerts || [];
  const riskLevel = student ? getRiskLevel(student) : 'low';

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">My Academic Profile</h1>
                <p className="text-muted-foreground mt-1">Track your performance and progress</p>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={getGradeVariant(student?.grade || '')} className="text-lg px-4 py-2">
                  Grade: {student?.grade}
                </Badge>
                <Badge variant={getRiskVariant(riskLevel)} className="text-lg px-4 py-2">
                  {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
                </Badge>
              </div>
            </div>
          </div>

          {/* Risk Alerts Banner */}
          {riskAlerts.length > 0 && (
            <div className="mb-6">
              {riskAlerts.map((alert, index) => (
                <Card key={index} className={`mb-3 border-l-4 ${alert.type === 'danger' ? 'border-destructive' : alert.type === 'warning' ? 'border-yellow-500' : 'border-blue-500'}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      {alert.icon === 'AlertTriangle' && <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${alert.type === 'danger' ? 'text-destructive' : alert.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`} />}
                      {alert.icon === 'CheckCircle' && <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />}
                      {alert.icon === 'XCircle' && <XCircle className="h-5 w-5 flex-shrink-0 text-destructive" />}
                      {alert.icon === 'TrendingUp' && <TrendingUp className="h-5 w-5 flex-shrink-0 text-green-500" />}
                      {alert.icon === 'Target' && <Target className="h-5 w-5 flex-shrink-0 text-primary" />}
                      {alert.icon === 'Clock' && <Clock className="h-5 w-5 flex-shrink-0 text-yellow-500" />}
                      {alert.icon === 'BookOpen' && <BookOpen className="h-5 w-5 flex-shrink-0 text-blue-500" />}
                      {alert.icon === 'Moon' && <Moon className="h-5 w-5 flex-shrink-0 text-purple-500" />}
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

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Student Info & Score */}
            <div className="lg:col-span-2 space-y-6">
              {/* Score Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Final Score Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <div className="text-4xl font-bold text-primary">{student?.final_score?.toFixed(1) || 'N/A'}</div>
                      <div className="text-sm text-muted-foreground">Final Score</div>
                    </div>
                    <div className="text-center p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <div className="text-4xl font-bold text-green-600 dark:text-green-400">{percentiles?.final_score || 0}%</div>
                      <div className="text-sm text-muted-foreground">Class Percentile</div>
                    </div>
                    <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{percentiles?.attendance_percent || 0}%</div>
                      <div className="text-sm text-muted-foreground">Attendance Percentile</div>
                    </div>
                    <div className="text-center p-4 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">{student?.previous_gpa?.toFixed(2) || 'N/A'}</div>
                      <div className="text-sm text-muted-foreground">Previous GPA</div>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Attendance</span>
                        <span>{student?.attendance_percent?.toFixed(1) || 0}%</span>
                      </div>
                      <Progress value={student?.attendance_percent || 0} className="h-3" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Study Hours/Day</span>
                        <span>{student?.study_hours_per_day?.toFixed(1) || 0} hrs</span>
                      </div>
                      <Progress value={Math.min(((student?.study_hours_per_day || 0) / 12) * 100, 100)} className="h-3" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Sleep Hours</span>
                        <span>{student?.sleep_hours?.toFixed(1) || 0} hrs</span>
                      </div>
                      <Progress value={Math.min(((student?.sleep_hours || 0) / 10) * 100, 100)} className="h-3" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Previous GPA</span>
                        <span>{student?.previous_gpa?.toFixed(2) || 0}/4.0</span>
                      </div>
                      <Progress value={Math.min(((student?.previous_gpa || 0) / 4) * 100, 100)} className="h-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for Details */}
              <Tabs defaultValue="academic" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="academic">
                    <GraduationCap className="mr-2 h-4 w-4" />
                    Academic Details
                  </TabsTrigger>
                  <TabsTrigger value="habits">
                    <BookOpen className="mr-2 h-4 w-4" />
                    Study Habits
                  </TabsTrigger>
                  <TabsTrigger value="demographics">
                    <User className="mr-2 h-4 w-4" />
                    Demographics
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="academic">
                  <Card>
                    <CardContent className="pt-0">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Final Score</p>
                          <p className="text-xl font-bold">{student?.final_score?.toFixed(1) || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Grade</p>
                          <Badge variant={getGradeVariant(student?.grade || '')} className="text-lg">{student?.grade}</Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Class Percentile</p>
                          <p className="text-xl font-bold">{percentiles?.final_score || 0}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Previous GPA</p>
                          <p className="text-xl font-bold">{student?.previous_gpa?.toFixed(2) || 'N/A'}/4.0</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Attendance</p>
                          <p className="text-xl font-bold">{student?.attendance_percent?.toFixed(1) || 'N/A'}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Attendance Percentile</p>
                          <p className="text-xl font-bold">{percentiles?.attendance_percent || 0}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="habits">
                  <Card>
                    <CardContent className="pt-0">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Study Hours/Day</p>
                          <p className="text-xl font-bold">{student?.study_hours_per_day?.toFixed(1) || 'N/A'} hrs</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Study Percentile</p>
                          <p className="text-xl font-bold">{percentiles?.study_hours_per_day || 0}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Sleep Hours</p>
                          <p className="text-xl font-bold">{student?.sleep_hours?.toFixed(1) || 'N/A'} hrs</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Sleep Percentile</p>
                          <p className="text-xl font-bold">{percentiles?.sleep_hours || 0}%</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Extracurricular</p>
                          <Badge variant={student?.extracurricular === 'Yes' ? 'success' : 'secondary'}>
                            {student?.extracurricular || 'N/A'}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Part-time Job</p>
                          <Badge variant={student?.part_time_job === 'Yes' ? 'warning' : 'secondary'}>
                            {student?.part_time_job || 'N/A'}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Internet Access</p>
                          <Badge variant={student?.internet_access === 'Yes' ? 'success' : 'secondary'}>
                            {student?.internet_access || 'N/A'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="demographics">
                  <Card>
                    <CardContent className="pt-0">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Student ID</p>
                          <p className="text-xl font-bold font-mono">{student?.student_id || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Name</p>
                          <p className="text-xl font-bold">{student?.name || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="text-xl font-bold">{student?.email || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Gender</p>
                          <Badge variant={student?.gender === 'Male' ? 'default' : 'secondary'} className="text-lg">
                            {student?.gender || 'N/A'}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Age</p>
                          <p className="text-xl font-bold">{student?.age || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Parental Education</p>
                          <p className="text-xl font-bold">{student?.parental_education || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Account Created</p>
                          <p className="text-xl font-bold">{student?.created_at ? new Date(student.created_at).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Notes */}
              {student?.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{student.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Charts */}
            <div className="space-y-6">
              {/* Grade Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Your Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Your Score', value: student?.final_score || 0, fill: '#3b82f6' },
                            { name: 'Remaining', value: 100 - (student?.final_score || 0), fill: '#e2e8f0' },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={100}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        />
                        <Tooltip formatter={(value: number) => [value, '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center mt-4">
                    <p className="text-2xl font-bold text-primary">{student?.final_score?.toFixed(1) || 'N/A'}</p>
                    <p className="text-muted-foreground">out of 100</p>
                  </div>
                </CardContent>
              </Card>

              {/* Percentile Comparison Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Class Percentiles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { metric: 'Final Score', percentile: percentiles?.final_score || 0 },
                        { metric: 'Attendance', percentile: percentiles?.attendance_percent || 0 },
                        { metric: 'Study Hours', percentile: percentiles?.study_hours_per_day || 0 },
                        { metric: 'Sleep Hours', percentile: percentiles?.sleep_hours || 0 },
                        { metric: 'Prev GPA', percentile: percentiles?.previous_gpa || 0 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip formatter={(value: number) => [`${value}%`, 'Percentile']} />
                        <Bar dataKey="percentile" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-2">Higher percentile = better relative performance</p>
                </CardContent>
              </Card>

              {/* Habits Radar-like Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Habit Scores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { habit: 'Attendance', value: student?.attendance_percent || 0, max: 100 },
                        { habit: 'Study Hrs', value: Math.min(((student?.study_hours_per_day || 0) / 12) * 100, 100), max: 100 },
                        { habit: 'Sleep Hrs', value: Math.min(((student?.sleep_hours || 0) / 10) * 100, 100), max: 100 },
                        { habit: 'Prev GPA', value: Math.min(((student?.previous_gpa || 0) / 4) * 100, 100), max: 100 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="habit" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip formatter={(value: number) => [`${value.toFixed(0)}%`, 'Score']} />
                        <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-2">Normalized habit scores (100% = optimal)</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
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

function getRiskVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (level) {
    case 'high': return 'destructive';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'outline';
  }
}