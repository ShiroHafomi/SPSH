'use client';

import { useEffect, useState } from 'react';
import { Brain, GraduationCap, AlertTriangle, TrendingUp, CheckCircle, XCircle, Search, Filter, FileText, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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

interface CounselResult {
  student_id: number;
  interventionNote: string;
  grade: string;
  final_score: number;
  grade_probabilities: Record<string, number>;
}

export default function TeacherAiCounselPage() {
  const [atRiskData, setAtRiskData] = useState<AtRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [customPromptDialogOpen, setCustomPromptDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [lastResult, setLastResult] = useState<CounselResult | null>(null);

  useEffect(() => {
    fetchAtRiskStudents();
  }, []);

  const fetchAtRiskStudents = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/teacher/at-risk', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch at-risk students');
      const result = await res.json();
      setAtRiskData(result);
    } catch (err) {
      console.error('Failed to fetch at-risk students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCounsel = async (studentId: number, prompt?: string) => {
    setGenerating(prev => new Set(prev).add(studentId));
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/teacher/ai-counsel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentId, customPrompt: prompt }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate AI counsel');
      }
      const result = await res.json();
      setLastResult(result);
      alert('AI counseling note generated and saved to student notes!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate AI counsel');
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
      setCustomPromptDialogOpen(false);
      setSelectedStudentId(null);
      setCustomPrompt('');
    }
  };

  const openCustomPromptDialog = (studentId: number) => {
    setSelectedStudentId(studentId);
    setCustomPromptDialogOpen(true);
  };

  const handleCustomPromptSubmit = () => {
    if (selectedStudentId) {
      handleGenerateCounsel(selectedStudentId, customPrompt || undefined);
    }
  };

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

  const students = atRiskData?.students || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">AI Counseling Tool</h1>
            <p className="text-muted-foreground mt-1">Generate personalized intervention notes for at-risk students</p>
          </div>

          {/* Info Card */}
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">How it works</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a student to generate a personalized AI intervention note based on their academic profile,
                    risk factors, and predicted performance. The note will be saved directly to the student's record.
                    You can optionally provide a custom prompt to guide the AI's focus.
                  </p>
                </div>
              </div>
            </CardContent
          </Card>

          {/* Students Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                At-Risk Students ({students.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {students.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No at-risk students found</h3>
                  <p className="text-muted-foreground">All students are currently performing within acceptable thresholds</p>
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
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Risk Score</TableHead>
                        <TableHead>Risk Factors</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell className="font-mono">{student.student_id}</TableCell>
                          <TableCell>
                            <Badge variant={getGradeVariant(student.grade)}>{student.grade}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{student.final_score.toFixed(1)}</TableCell>
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
                                  {factor.field.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCustomPromptDialog(student.id)}
                                disabled={generating.has(student.id)}
                              >
                                <FileText className="mr-1 h-3 w-3" />
                                Custom Prompt
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateCounsel(student.id)}
                                disabled={generating.has(student.id)}
                              >
                                {generating.has(student.id) ? (
                                  <>
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Brain className="mr-1 h-3 w-3" />
                                    Generate
                                  </>
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent
          </Card>

          {/* Last Result Display */}
          {lastResult && (
            <Card className="mt-6 border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Last Generated Counsel Note
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 mb-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">Student ID</p>
                    <p className="font-bold">{lastResult.student_id}</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">Predicted Grade</p>
                    <Badge variant={getGradeVariant(lastResult.grade)} className="text-lg">{lastResult.grade}</Badge>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">Predicted Score</p>
                    <p className="font-bold">{lastResult.final_score.toFixed(1)}</p>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm">{lastResult.interventionNote}</pre>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(lastResult.grade_probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([grade, prob]) => (
                      <Badge key={grade} variant={getGradeVariant(grade)} className="text-sm">
                        {grade}: {(prob * 100).toFixed(1)}%
                      </Badge>
                    ))}
                </div>
              </CardContent
            </Card>
          )}

          {/* Custom Prompt Dialog */}
          <Dialog open={customPromptDialogOpen} onOpenChange={setCustomPromptDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Custom AI Prompt</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Optionally provide additional context or focus areas for the AI counselor.
                  Leave blank for standard intervention note generation.
                </p>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., Focus on study habits and time management strategies, or provide specific motivational approach..."
                  className="min-h-[120px]"
                  rows={5}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCustomPromptDialogOpen(false); setSelectedStudentId(null); setCustomPrompt(''); }}>
                  Cancel
                </Button>
                <Button onClick={handleCustomPromptSubmit} disabled={generating.has(selectedStudentId || 0)}>
                  {generating.has(selectedStudentId || 0) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      Generate with Custom Prompt
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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