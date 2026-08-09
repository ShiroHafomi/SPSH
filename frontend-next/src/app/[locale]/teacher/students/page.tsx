'use client';

import { useEffect, useState } from 'react';
import { Search, GraduationCap, Brain, AlertTriangle, TrendingUp, Download, Filter, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, useForm } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Label } from '@/components/ui/label';
import Cookies from 'js-cookie';

const studentSchema = z.object({
  student_id: z.number().min(1, 'Student ID is required'),
  gender: z.enum(['Male', 'Female']),
  age: z.number().min(16).max(100),
  study_hours_per_day: z.number().min(0).max(24),
  attendance_percent: z.number().min(0).max(100),
  sleep_hours: z.number().min(0).max(24),
  previous_gpa: z.number().min(0).max(4),
  parental_education: z.enum(['High School', 'Bachelor', 'Master', 'PhD']),
  internet_access: z.enum(['Yes', 'No']),
  extracurricular: z.enum(['Yes', 'No']),
  part_time_job: z.enum(['Yes', 'No']),
  final_score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  notes: z.string().optional(),
});

type StudentFormData = z.infer<typeof studentSchema>;

interface Student {
  id: number;
  student_id: number;
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
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      student_id: 0,
      gender: 'Male',
      age: 18,
      study_hours_per_day: 0,
      attendance_percent: 0,
      sleep_hours: 0,
      previous_gpa: 0,
      parental_education: 'High School',
      internet_access: 'Yes',
      extracurricular: 'No',
      part_time_job: 'No',
      final_score: 0,
      grade: 'C',
      notes: '',
    },
  });

  useEffect(() => {
    fetchStudents();
  }, [page, search, gradeFilter, riskFilter]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        ...(search && { q: search }),
        ...(gradeFilter !== 'all' && { grade: gradeFilter }),
        ...(riskFilter !== 'all' && { risk: riskFilter }),
      });
      const res = await fetch(`http://localhost:3001/api/teacher/students?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch students');
      const data = await res.json();
      setStudents(data.students);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (student: Student) => {
    setSelectedStudent(student);
    form.reset({
      student_id: student.student_id,
      gender: student.gender as 'Male' | 'Female',
      age: student.age,
      study_hours_per_day: student.study_hours_per_day,
      attendance_percent: student.attendance_percent,
      sleep_hours: student.sleep_hours,
      previous_gpa: student.previous_gpa,
      parental_education: student.parental_education as 'High School' | 'Bachelor' | 'Master' | 'PhD',
      internet_access: student.internet_access as 'Yes' | 'No',
      extracurricular: student.extracurricular as 'Yes' | 'No',
      part_time_job: student.part_time_job as 'Yes' | 'No',
      final_score: student.final_score,
      grade: student.grade as 'A' | 'B' | 'C' | 'D' | 'F',
      notes: student.notes || '',
    });
    setEditDialogOpen(true);
  };

  const onSubmit = async (data: StudentFormData) => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      const token = Cookies.get('access_token');
      const res = await fetch(`http://localhost:3001/api/teacher/students/${selectedStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update student');
      }
      form.reset();
      setEditDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiEvaluate = async (student: Student) => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/teacher/ai-counsel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_id: student.id }),
      });
      if (!res.ok) throw new Error('Failed to generate AI counsel');
      const data = await res.json();
      alert(data.feedback || 'AI evaluation completed!');
      fetchStudents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate AI counsel');
    }
  };

  const paginatedStudents = students;

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

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Student Management</h1>
            <p className="text-muted-foreground mt-1">View, edit, and manage student records</p>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search students..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      className="w-64 pl-10"
                    />
                  </div>
                  <Select value={gradeFilter} onValueChange={(v) => { setGradeFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="All grades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(1); }}>
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
                  <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 per page</SelectItem>
                      <SelectItem value="20">20 per page</SelectItem>
                      <SelectItem value="50">50 per page</SelectItem>
                      <SelectItem value="100">100 per page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Students Table */}
          <Card>
            <CardContent className="p-0">
              {students.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No students found</h3>
                  <p className="text-muted-foreground">Try adjusting your filters or search terms</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Study hrs/day</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Sleep hrs</TableHead>
                        <TableHead>Prev GPA</TableHead>
                        <TableHead>Final Score</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell>{student.id}</TableCell>
                          <TableCell className="font-mono">{student.student_id}</TableCell>
                          <TableCell>
                            <Badge variant={student.gender === 'Male' ? 'default' : 'secondary'}>{student.gender}</Badge>
                          </TableCell>
                          <TableCell>{student.age}</TableCell>
                          <TableCell>{student.study_hours_per_day.toFixed(1)}</TableCell>
                          <TableCell>
                            <span className={student.attendance_percent < 75 ? 'text-destructive font-medium' : ''}>
                              {student.attendance_percent.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>{student.sleep_hours.toFixed(1)}</TableCell>
                          <TableCell>{student.previous_gpa.toFixed(2)}</TableCell>
                          <TableCell className="font-medium">{student.final_score.toFixed(1)}</TableCell>
                          <TableCell>
                            <Badge variant={getGradeVariant(student.grade)}>{student.grade}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getRiskVariant(getRiskLevel(student))}>
                              {getRiskLevel(student).charAt(0).toUpperCase() + getRiskLevel(student).slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(student)}
                                title="Edit"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAiEvaluate(student)}
                                title="AI Evaluate"
                              >
                                <Brain className="h-4 w-4 text-primary" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, students.length + (page - 1) * pageSize)} of {students.length + (page - 1) * pageSize} students
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        Previous
                      </Button>
                      <span className="px-4 text-sm">Page {page} of {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Student Record</DialogTitle>
              </DialogHeader>
              <Form {...form} onSubmit={form.handleSubmit(onSubmit)}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="student_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Student ID</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} disabled />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="age"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input type="number" min="16" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="study_hours_per_day"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Study Hours/Day</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="24" step="0.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="attendance_percent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Attendance %</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="100" step="0.1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sleep_hours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sleep Hours</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="24" step="0.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="previous_gpa"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Previous GPA</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="4" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="parental_education"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parental Education</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select education" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="High School">High School</SelectItem>
                              <SelectItem value="Bachelor">Bachelor</SelectItem>
                              <SelectItem value="Master">Master</SelectItem>
                              <SelectItem value="PhD">PhD</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="internet_access"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Internet Access</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="extracurricular"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Extracurricular</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="part_time_job"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Part-time Job</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="final_score"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Final Score</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" max="100" step="0.1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="A">A</SelectItem>
                              <SelectItem value="B">B</SelectItem>
                              <SelectItem value="C">C</SelectItem>
                              <SelectItem value="D">D</SelectItem>
                              <SelectItem value="F">F</SelectItem>
                            </SelectContent>
                            <FormMessage />
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <textarea
                              {...field}
                              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              rows={4}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { form.reset(); setEditDialogOpen(false); setSelectedStudent(null); }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
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

function getRiskLevel(student: Student): string {
  let riskFactors = 0;
  if (student.attendance_percent < 75) riskFactors++;
  if (student.sleep_hours < 5.5) riskFactors++;
  if (student.previous_gpa < 2.5) riskFactors++;
  if (student.study_hours_per_day < 2) riskFactors++;

  if (riskFactors >= 3) return 'high';
  if (riskFactors >= 1) return 'medium';
  return 'low';
}

function getRiskVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (level) {
    case 'high': return 'destructive';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'outline';
  }
}