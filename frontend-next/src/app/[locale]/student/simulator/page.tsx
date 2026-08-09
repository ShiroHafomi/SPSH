'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, BookOpen, Moon, Target, AlertTriangle, CheckCircle, XCircle, RotateCcw, Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Cookies from 'js-cookie';

interface SimulationResult {
  current: {
    final_score: number;
    grade: string;
    grade_confidence: number;
    grade_probabilities: Record<string, number>;
  };
  simulated: {
    final_score: number;
    grade: string;
    grade_confidence: number;
    grade_probabilities: Record<string, number>;
  };
  recommendations: Array<{
    type: 'positive' | 'warning' | 'danger' | 'info';
    icon: string;
    title: string;
    message: string;
  }>;
  inputs: {
    study_hours_per_day: number;
    sleep_hours: number;
    attendance_percent: number;
  };
}

interface StudentProfile {
  student_id: number;
  name: string;
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
}

export default function StudentSimulatorPage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');

  // Default inputs from current student profile
  const [studyHours, setStudyHours] = useState(0);
  const [sleepHours, setSleepHours] = useState(0);
  const [attendance, setAttendance] = useState(0);

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
      setProfile(data.student);
      // Initialize sliders with current values
      setStudyHours(data.student.study_hours_per_day);
      setSleepHours(data.student.sleep_hours);
      setAttendance(data.student.attendance_percent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = async () => {
    if (!profile) return;
    setSimulating(true);
    setError('');
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/student/me/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          study_hours_per_day: studyHours,
          sleep_hours: sleepHours,
          attendance_percent: attendance,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Simulation failed');
      }
      const data = await res.json();
      setSimulation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const handleReset = () => {
    if (!profile) return;
    setStudyHours(profile.study_hours_per_day);
    setSleepHours(profile.sleep_hours);
    setAttendance(profile.attendance_percent);
    setSimulation(null);
  };

  const getGradeVariant = (grade: string) => {
    switch (grade) {
      case 'A': return 'success';
      case 'B': return 'default';
      case 'C': return 'warning';
      case 'D': return 'secondary';
      case 'F': return 'destructive';
      default: return 'outline';
    }
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

  if (error && !profile) {
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

  const currentScore = simulation?.current?.final_score || profile?.final_score || 0;
  const currentGrade = simulation?.current?.grade || profile?.grade || 'N/A';
  const simulatedScore = simulation?.simulated?.final_score;
  const simulatedGrade = simulation?.simulated?.grade;
  const scoreDiff = simulatedScore !== undefined ? simulatedScore - currentScore : 0;
  const gradeImproved = simulatedGrade && currentGrade !== 'N/A' ?
    ['A', 'B', 'C', 'D', 'F'].indexOf(simulatedGrade) < ['A', 'B', 'C', 'D', 'F'].indexOf(currentGrade) : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">What-If Habit Simulator</h1>
            <p className="text-muted-foreground mt-1">Adjust your habits to see predicted impact on your final score and grade</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Panel - Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Adjust Your Habits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Study Hours Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Study Hours per Day</Label>
                    <span className="text-lg font-bold text-primary">{studyHours.toFixed(1)} hrs</span>
                  </div>
                  <Slider
                    value={[studyHours]}
                    onValueChange={([val]) => setStudyHours(val)}
                    max={16}
                    step={0.5}
                    min={0}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>0 hrs</span>
                    <span>Current: {profile?.study_hours_per_day?.toFixed(1) || 0} hrs</span>
                    <span>16 hrs</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recommended: 3+ hours/day for optimal performance
                  </p>
                </div>

                {/* Sleep Hours Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Sleep Hours per Night</Label>
                    <span className="text-lg font-bold text-purple-600">{sleepHours.toFixed(1)} hrs</span>
                  </div>
                  <Slider
                    value={[sleepHours]}
                    onValueChange={([val]) => setSleepHours(val)}
                    max={12}
                    step={0.5}
                    min={0}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>0 hrs</span>
                    <span>Current: {profile?.sleep_hours?.toFixed(1) || 0} hrs</span>
                    <span>12 hrs</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recommended: 7-9 hours for memory consolidation
                  </p>
                </div>

                {/* Attendance Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Attendance Percentage</Label>
                    <span className="text-lg font-bold text-green-600">{attendance.toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[attendance]}
                    onValueChange={([val]) => setAttendance(val)}
                    max={100}
                    step={1}
                    min={0}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>0%</span>
                    <span>Current: {profile?.attendance_percent?.toFixed(0) || 0}%</span>
                    <span>100%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Minimum 75% required to sit for exams; aim for 85%+
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={runSimulation}
                    disabled={simulating}
                    className="flex-1"
                    size="lg"
                  >
                    {simulating ? (
                      <>
                        <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                        Simulating...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Run Simulation
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="flex-1"
                    size="lg"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>

                {error && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current vs Simulated Comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Impact Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {/* Current */}
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm text-muted-foreground mb-2">Current Status</h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-bold">{currentScore.toFixed(1)}</div>
                        <div className="text-sm text-muted-foreground">Predicted Final Score</div>
                      </div>
                      <Badge variant={getGradeVariant(currentGrade)} className="text-xl px-4 py-2">
                        Grade: {currentGrade}
                      </Badge>
                    </div>
                  </div>

                  {/* Simulated */}
                  {simulation && (
                    <div className={`p-4 rounded-lg ${scoreDiff >= 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                      <h4 className="text-sm text-muted-foreground mb-2">Simulated Result</h4>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold">
                            {simulatedScore?.toFixed(1)}
                            {scoreDiff !== 0 && (
                              <span className={`ml-2 text-lg ${scoreDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">Predicted Final Score</div>
                        </div>
                        <Badge variant={getGradeVariant(simulatedGrade || '')} className="text-xl px-4 py-2">
                          Grade: {simulatedGrade}
                          {gradeImproved && <span className="ml-2 text-green-600">↑</span>}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {simulation && (
                    <div className="p-4 bg-primary/10 rounded-lg">
                      <h4 className="font-medium mb-2">Summary</h4>
                      <p className="text-sm">
                        {scoreDiff > 5 ? (
                          <span className="text-green-600">Excellent! Your changes could significantly improve your score by {Math.round(scoreDiff)} points.</span>
                        ) : scoreDiff > 0 ? (
                          <span className="text-blue-600">Good! Your changes could improve your score by {Math.round(scoreDiff)} points.</span>
                        ) : scoreDiff === 0 ? (
                          <span className="text-muted-foreground">No significant change predicted with these adjustments.</span>
                        ) : (
                          <span className="text-red-600">Caution: These changes might decrease your score by {Math.round(Math.abs(scoreDiff))} points.</span>
                        )}
                      </p>
                      {gradeImproved && (
                        <p className="text-sm text-green-600 mt-1">Your grade could improve from {currentGrade} to {simulatedGrade}!</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          {simulation && simulation.recommendations.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Personalized Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {simulation.recommendations.map((rec, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        rec.type === 'positive' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                        rec.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
                        rec.type === 'danger' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                        'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {rec.icon === 'TrendingUp' && <TrendingUp className={`h-5 w-5 flex-shrink-0 ${rec.type === 'positive' ? 'text-green-500' : rec.type === 'warning' ? 'text-yellow-500' : rec.type === 'danger' ? 'text-red-500' : 'text-blue-500'}`} />}
                        {rec.icon === 'AlertTriangle' && <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-500" />}
                        {rec.icon === 'CheckCircle' && <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />}
                        {rec.icon === 'XCircle' && <XCircle className="h-5 w-5 flex-shrink-0 text-red-500" />}
                        {rec.icon === 'Target' && <Target className="h-5 w-5 flex-shrink-0 text-primary" />}
                        {rec.icon === 'BookOpen' && <BookOpen className="h-5 w-5 flex-shrink-0 text-blue-500" />}
                        {rec.icon === 'Moon' && <Moon className="h-5 w-5 flex-shrink-0 text-purple-500" />}
                        <div>
                          <h5 className="font-medium">{rec.title}</h5>
                          <p className="text-sm text-muted-foreground mt-1">{rec.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grade Probabilities */}
          {simulation && simulation.simulated.grade_probabilities && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Simulated Grade Probabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(simulation.simulated.grade_probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([grade, prob]) => (
                      <Badge
                        key={grade}
                        variant={getGradeVariant(grade)}
                        className="text-base px-4 py-2 flex items-center gap-2"
                      >
                        <span className="font-mono w-8">{grade}</span>
                        <div className="flex-1 w-24">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${prob * 100}%`, backgroundColor: getGradeColor(grade) }}
                            />
                          </div>
                        </div>
                        <span className="font-mono w-16 text-right">{(prob * 100).toFixed(1)}%</span>
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
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