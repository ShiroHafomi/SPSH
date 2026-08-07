'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Brain, Users, Download, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  risk_factors: string[];
}

interface AtRiskConfig {
  attendance: number;
  study_hours: number;
  gpa: number;
}

export default function AdminAtRiskPage() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AtRiskConfig>({
    attendance: 75,
    study_hours: 2,
    gpa: 2.5,
  });
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [generatingNotes, setGeneratingNotes] = useState<number | null>(null);

  useEffect(() => {
    fetchAtRiskStudents();
  }, [config]);

  const fetchAtRiskStudents = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        attendance: config.attendance.toString(),
        study_hours: config.study_hours.toString(),
        gpa: config.gpa.toString(),
      });
      const res = await fetch(`http://localhost:3001/api/admin/at-risk?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch at-risk students');
      const data = await res.json();
      setStudents(data.students || []);
    } catch (err) {
      console.error('Failed to fetch at-risk students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAiCounsel = async (studentId: number) => {
    setGeneratingNotes(studentId);
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/admin/students/bulk-ai-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [studentId] }),
      });
      if (!res.ok) throw new Error('Failed to generate AI counsel');
      const data = await res.json();
      alert(data.results?.[0]?.interventionNote || 'AI counsel generated successfully!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate AI counsel');
    } finally {
      setGeneratingNotes(null);
    }
  };

  const handleConfigChange = (key: keyof AtRiskConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const filteredStudents = students.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">At-Risk Students</h1>
            <p className="text-muted-foreground mt-1">Early warning system for struggling students</p>
          </div>

          {/* Configuration Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Risk Threshold Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Attendance % Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={config.attendance}
                    onChange={(e) => handleConfigChange('attendance', parseInt(e.target.value) || 0)}
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
                    value={config.study_hours}
                    onChange={(e) => handleConfigChange('study_hours', parseFloat(e.target.value) || 0)}
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
                    value={config.gpa}
                    onChange={(e) => handleConfigChange('gpa', parseFloat(e.target.value) || 0)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Flag if previous GPA below this</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex gap-2">
              <Input
                placeholder="Search students..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-[160px]">
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
            <div className="flex gap-2">
              <Badge variant="destructive">{filteredStudents.filter(s => s.risk_level === 'high').length} High</Badge>
              <Badge variant="warning">{filteredStudents.filter(s => s.risk_level === 'medium').length} Medium</Badge>
              <Badge variant="success">{filteredStudents.filter(s => s.risk_level === 'low').length} Low</Badge>
            </div>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              </CardContent>
            </Card>
          ) : filteredStudents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No at-risk students found</h3>
                <p className="text-muted-foreground">All students are performing within the configured thresholds</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
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
                        <TableCell>{student.student_id}</TableCell>
                        <TableCell>
                          <Badge variant={getGradeVariant(student.grade)}>{student.grade}</Badge>
                        </TableCell>
                        <TableCell>{student.final_score.toFixed(1)}</TableCell>
                        <TableCell>{student.attendance_percent.toFixed(1)}%</TableCell>
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
                                {factor.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAiCounsel(student.id)}
                            disabled={generatingNotes === student.id}
                          >
                            {generatingNotes === student.id ? (
                              <>
                                <Clock className="mr-1 h-3 w-3 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Brain className="mr-1 h-3 w-3" />
                                AI Counsel
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
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