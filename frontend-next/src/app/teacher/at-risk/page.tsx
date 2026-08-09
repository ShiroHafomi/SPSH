'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, GraduationCap, TrendingUp, Clock, Brain, Download, Filter, Search, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import Cookies from 'js-cookie';

interface AtRiskStudent {
  id: number;
  student_id: number;
  name: string;
  final_score: number;
  grade: string;
  attendance_percent: number;
  study_hours_per_day: number;
  sleep_hours: number;
  previous_gpa: number;
  risk_level: string;
  risk_score: number;
  risk_factors: Array<{ field: string; value: number; threshold: number }>;
}

interface AtRiskResponse {
  students: AtRiskStudent[];
  total: number;
  thresholds: {
    attendance: number;
    studyHours: number;
    gpa: number;
    sleepHours: number;
  };
}

export default function TeacherAtRiskPage() {
  const [data, setData] = useState<AtRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [thresholds, setThresholds] = useState({
    attendance: 75,
    studyHours: 2,
    gpa: 2.5,
    sleepHours: 5.5,
  });

  useEffect(() => {
    fetchAtRiskStudents();
  }, [thresholds]);

  const fetchAtRiskStudents = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        attendance: thresholds.attendance.toString(),
        study_hours: thresholds.studyHours.toString(),
        gpa: thresholds.gpa.toString(),
        sleep_hours: thresholds.sleepHours.toString(),
      });
      const res = await fetch(`http://localhost:3001/api/teacher/at-risk?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch at-risk students');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load at-risk students');
    } finally {
      setLoading(false);
    }
  };

  const handleThresholdChange = (key: keyof typeof thresholds, value: number) => {
    setThresholds(prev => ({ ...prev, [key]: value }));
  };

  const handleAiCounsel = async (studentId: number) => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/teacher/ai-counsel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentId }),
      });
      if (!res.ok) throw new Error('Failed to generate AI counsel');
      const result = await res.json();
      alert(result.interventionNote || 'AI counseling note generated and saved to student notes!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate AI counsel');
    }
  };

  const filteredStudents = data?.students.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.student_id.toString().includes(search)) return false;
    if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false;
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto animate-pulse space-y-6">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="h-64 bg-card border rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const riskCounts = {
    high: filteredStudents.filter(s => s.risk_level === 'high').length,
    medium: filteredStudents.filter(s => s.risk_level === 'medium').length,
    low: filteredStudents.filter(s => s.risk_level === 'low').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">At-Risk Students</h1>
            <p className="text-muted-foreground mt-1">Early warning system for struggling students</p>
          </div>

          {/* Threshold Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Risk Threshold Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Attendance % Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={thresholds.attendance}
                    onChange={(e) => handleThresholdChange('attendance', parseInt(e.target.value) || 0)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Flag if attendance below this %</p>
                </div>
                <div className="space-y-2">
                  <Label>Study Hours Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={thresholds.studyHours}
                    onChange={(e) => handleThresholdChange('studyHours', parseFloat(e.target.value) || 0)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Flag if study hours below this</p>
                </div>
                <div className="space-y-2">
                  <Label>GPA Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="4"
                    step="0.1"
                    value={thresholds.gpa}
                    onChange={(e) => handleThresholdChange('gpa', parseFloat(e.target.value) || 0)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Flag if previous GPA below this</p>
                </div>
                <div className="space-y-2">
                  <Label>Sleep Hours Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={thresholds.sleepHours}
                    onChange={(e) => handleThresholdChange('sleepHours', parseFloat(e.target.value) || 0)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Flag if sleep hours below this</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-destructive">{riskCounts.high}</div>
                    <div className="text-sm text-muted-foreground">High Risk</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{riskCounts.medium}</div>
                    <div className="text-sm text-muted-foreground">Medium Risk</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{riskCounts.low}</div>
                    <div className="text-sm text-muted-foreground">Low Risk</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <GraduationCap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary">{data?.total || 0}</div>
                    <div className="text-sm text-muted-foreground">Total At-Risk</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or student ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-64 pl-10"
                    />
                  </div>
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All risk levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risk Levels</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="low">Low Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Students Table */}
          <Card>
            <CardContent className="p-0">
              {filteredStudents.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No at-risk students found</h3>
                  <p className="text-muted-foreground">All students are performing within the configured thresholds</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Study hrs/day</TableHead>
                        <TableHead>Sleep hrs</TableHead>
                        <TableHead>Prev GPA</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Risk Score</TableHead>
                        <TableHead>Risk Factors</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell className="font-mono">{student.student_id}</TableCell>
                          <TableCell>
                            <Badge variant={getGradeVariant(student.grade)}>{student.grade}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{student.final_score.toFixed(1)}</TableCell>
                          <TableCell>
                            <span className={student.attendance_percent < 75 ? 'text-destructive font-medium' : ''}>
                              {student.attendance_percent.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>{student.study_hours_per_day.toFixed(1)}</TableCell>
                          <TableCell>{student.sleep_hours.toFixed(1)}</TableCell>
                          <TableCell>{student.previous_gpa.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={getRiskVariant(student.risk_level)}>
                              {student.risk_level.charAt(0).toUpperCase() + student.risk_level.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">{student.risk_score}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {student.risk_factors.map((factor, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {factor.field.replace('_', ' ')}: {factor.value} {'<'} {factor.threshold}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAiCounsel(student.id)}
                            >
                              <Brain className="mr-1 h-3 w-3" />
                              AI Counsel
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
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