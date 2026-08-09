'use client';

import { useEffect, useState } from 'react';
import { Search, GraduationCap, Download, Filter, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
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

interface Column {
  name: string;
  label: string;
  type: string;
  chart_role: string;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [partTimeJobFilter, setPartTimeJobFilter] = useState('all');
  const [parentalEducationFilter, setParentalEducationFilter] = useState('all');
  const [atRiskFilter, setAtRiskFilter] = useState('all');
  const [sort, setSort] = useState('id');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterOptions, setFilterOptions] = useState({
    grades: [] as string[],
    genders: [] as string[],
    partTimeJobs: [] as string[],
    parentalEducations: [] as string[],
  });

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
  }, [page, search, gradeFilter, genderFilter, partTimeJobFilter, parentalEducationFilter, atRiskFilter, sort, dir]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        sort,
        dir,
        ...(search && { q: search }),
        ...(gradeFilter !== 'all' && { grade: gradeFilter }),
        ...(genderFilter !== 'all' && { gender: genderFilter }),
        ...(partTimeJobFilter !== 'all' && { part_time_job: partTimeJobFilter }),
        ...(parentalEducationFilter !== 'all' && { parental_education: parentalEducationFilter }),
        ...(atRiskFilter !== 'all' && { at_risk: atRiskFilter }),
      });
      const res = await fetch(`http://localhost:3001/api/admin/students?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch students');
      const data = await res.json();
      setStudents(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setColumns(data.columns || []);
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sort === column) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setDir('asc');
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
      const res = await fetch(`http://localhost:3001/api/admin/students/${selectedStudent.id}`, {
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
      const res = await fetch('http://localhost:3001/api/admin/students/bulk-ai-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [student.id] }),
      });
      if (!res.ok) throw new Error('Failed to generate AI evaluation');
      const data = await res.json();
      alert(data.results?.[0]?.interventionNote || 'AI evaluation completed!');
      fetchStudents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate AI evaluation');
    }
  };

  const handleExport = async () => {
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        page: '1',
        size: total.toString(),
        sort,
        dir,
        ...(search && { q: search }),
        ...(gradeFilter !== 'all' && { grade: gradeFilter }),
        ...(genderFilter !== 'all' && { gender: genderFilter }),
        ...(partTimeJobFilter !== 'all' && { part_time_job: partTimeJobFilter }),
        ...(parentalEducationFilter !== 'all' && { parental_education: parentalEducationFilter }),
        ...(atRiskFilter !== 'all' && { at_risk: atRiskFilter }),
      });
      const res = await fetch(`http://localhost:3001/api/admin/students/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export');
    }
  };

  const handleBulkAiEvaluate = async () => {
    if (!confirm('Generate AI evaluation for all filtered students? This may take a while.')) return;
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/admin/students/bulk-ai-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filters: {
            grade: gradeFilter !== 'all' ? gradeFilter : undefined,
            gender: genderFilter !== 'all' ? genderFilter : undefined,
            part_time_job: partTimeJobFilter !== 'all' ? partTimeJobFilter : undefined,
            parental_education: parentalEducationFilter !== 'all' ? parentalEducationFilter : undefined,
            at_risk: atRiskFilter !== 'all' ? atRiskFilter : undefined,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to generate bulk AI evaluation');
      const data = await res.json();
      alert(`AI evaluation completed for ${data.results?.length || 0} students!`);
      fetchStudents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate bulk AI evaluation');
    }
  };

  const getRiskLevel = (student: Student): string => {
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
                <div className="flex flex-wrap gap-2">
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
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All grades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      {filterOptions.grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All genders" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      {filterOptions.genders.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={partTimeJobFilter} onValueChange={(v) => { setPartTimeJobFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Part-time job" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {filterOptions.partTimeJobs.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={parentalEducationFilter} onValueChange={(v) => { setParentalEducationFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Parental education" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {filterOptions.parentalEducations.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={atRiskFilter} onValueChange={(v) => { setAtRiskFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Risk level" />
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
                  <Button variant="outline" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={handleBulkAiEvaluate}>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Bulk AI Evaluate
                  </Button>
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map(col => (
                            <TableHead key={col.name} onClick={() => handleSort(col.name)} className="cursor-pointer select-none">
                              {col.label}
                              {sort === col.name && (dir === 'asc' ? ' ↑' : ' ↓')}
                            </TableHead>
                          ))}
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student) => (
                          <TableRow key={student.id}>
                            {columns.map(col => (
                              <TableCell key={col.name}>
                                {col.name === 'gender' ? (
                                  <Badge variant={student.gender === 'Male' ? 'default' : 'secondary'}>{student.gender}</Badge>
                                ) : col.name === 'grade' ? (
                                  <Badge variant={getGradeVariant(student.grade)}>{student.grade}</Badge>
                                ) : col.name === 'attendance_percent' ? (
                                  <span className={student.attendance_percent < 75 ? 'text-destructive font-medium' : ''}>
                                    {student.attendance_percent.toFixed(1)}%
                                  </span>
                                ) : col.name === 'final_score' ? (
                                  <span className="font-medium">{student.final_score.toFixed(1)}</span>
                                ) : (
                                  student[col.name as keyof Student] !== null && student[col.name as keyof Student] !== undefined
                                    ? String(student[col.name as keyof Student])
                                    : '-'
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Badge variant={getRiskVariant(getRiskLevel(student))}>
                                  {getRiskLevel(student).charAt(0).toUpperCase() + getRiskLevel(student).slice(1)}
                                </Badge>
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
                                  <AlertTriangle className="h-4 w-4 text-primary" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} students
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
              <Form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {columns.map(col => (
                      <FormField
                        key={col.name}
                        control={form.control}
                        name={col.name}
                        render={({ field }) => (
                          <FormItem className={col.name === 'notes' ? 'md:col-span-2' : ''}>
                            <FormLabel>{col.label}</FormLabel>
                            <FormControl>
                              {col.type === 'int' || col.type === 'decimal' ? (
                                <Input type="number" step={col.type === 'decimal' ? '0.01' : '1'} min={0} {...field} disabled={col.name === 'student_id'} />
                              ) : col.name === 'gender' ? (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select gender" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Female">Female</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : col.name === 'grade' ? (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select grade" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="A">A</SelectItem>
                                    <SelectItem value="B">B</SelectItem>
                                    <SelectItem value="C">C</SelectItem>
                                    <SelectItem value="D">D</SelectItem>
                                    <SelectItem value="F">F</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : col.name === 'parental_education' ? (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select education" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="High School">High School</SelectItem>
                                    <SelectItem value="Bachelor">Bachelor</SelectItem>
                                    <SelectItem value="Master">Master</SelectItem>
                                    <SelectItem value="PhD">PhD</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : ['internet_access', 'extracurricular', 'part_time_job'].includes(col.name) ? (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Yes">Yes</SelectItem>
                                    <SelectItem value="No">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : col.name === 'notes' ? (
                                <textarea
                                  {...field}
                                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  rows={4}
                                />
                              ) : (
                                <Input {...field} disabled={col.name === 'student_id'} />
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { form.reset(); setEditDialogOpen(false); setSelectedStudent(null); }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
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

function getRiskVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (level) {
    case 'high': return 'destructive';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'outline';
  }
}