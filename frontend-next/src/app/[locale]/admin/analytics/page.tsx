'use client';

import { useEffect, useState } from 'react';
import { BarChart2, Users, GraduationCap, TrendingUp, AlertTriangle, Shield, Activity, Download, Bot, Brain, Cpu, Database, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Cookies from 'js-cookie';

interface AdminAnalytics {
  userStats: {
    totalUsers: number;
    adminCount: number;
    teacherCount: number;
    studentCount: number;
    activeUsers: number;
    activeLast24h: number;
  };
  studentStats: {
    totalStudents: number;
    avgFinalScore: number;
    passRate: number;
    atRiskCount: number;
    gradeDistribution: { grade: string; count: number }[];
  };
  recentLogins: { date: string; count: number }[];
}

interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string;
  resource_id: number | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  student_id: number | null;
  department: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface MlHealthFileStats {
  sizeBytes?: number;
  sizeKB?: number;
  modifiedAt?: string;
  error?: string;
}

interface MlHealth {
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  issues: string[];
  lastTrainingAt: string | null;
  modelAgeDays: number | null;
  dataInfo: {
    n_samples: number;
    n_features: number;
    target_reg_range: [number, number];
    target_clf_distribution: Record<string, number>;
    feature_names: string[];
  } | null;
  regression: {
    bestModel: string;
    cvR2: number | null;
    cvRMSE: number | null;
    trainR2: number | null;
    overfitGap: number;
  } | null;
  classification: {
    bestModel: string;
    cvAccuracy: number | null;
    cvF1Weighted: number | null;
    trainAccuracy: number | null;
    overfitGap: number;
    gradeMap: Record<string, number> | null;
  } | null;
  cvStrategy: string | null;
  trainingDurationSec: number | null;
  fileStats: Record<string, MlHealthFileStats>;
  totalModelSizeMB: number;
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [mlHealth, setMlHealth] = useState<MlHealth | null>(null);
  const [mlHealthLoading, setMlHealthLoading] = useState(false);
  const [mlHealthError, setMlHealthError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'audit' | 'ml-health'>('overview');
  const [error, setError] = useState('');

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'ml-health') fetchMlHealth();
  }, [activeTab, auditPage, auditActionFilter, userSearch, userRoleFilter]);

  const fetchAnalytics = async () => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        page: auditPage.toString(),
        size: '50',
        ...(auditActionFilter && { action: auditActionFilter }),
      });
      const res = await fetch(`http://localhost:3001/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      const data = await res.json();
      setAuditLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  const fetchMlHealth = async () => {
    setMlHealthLoading(true);
    setMlHealthError('');
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/admin/ml-health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch ML health');
      const data = await res.json();
      setMlHealth(data);
    } catch (err) {
      setMlHealthError(err instanceof Error ? err.message : 'Failed to load ML health');
    } finally {
      setMlHealthLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = Cookies.get('access_token');
      const params = new URLSearchParams({
        page: '1',
        size: '50',
        ...(userRoleFilter !== 'all' && { role: userRoleFilter }),
        ...(userSearch && { q: userSearch }),
      });
      const res = await fetch(`http://localhost:3001/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userData = Object.fromEntries(formData);

    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(userData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user');
      }
      alert('User created successfully!');
      e.currentTarget.reset();
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const toggleUserStatus = async (user: User) => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch(`http://localhost:3001/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !user.is_active }),
      });
      if (!res.ok) throw new Error('Failed to update user');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const token = Cookies.get('access_token');
      const res = await fetch(`http://localhost:3001/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete user');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-card border rounded-lg" />
              ))}
            </div>
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
            <h1 className="text-3xl font-bold tracking-tight">Admin Analytics</h1>
            <p className="text-muted-foreground mt-1">System-wide overview and management</p>
          </div>

          <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as 'overview' | 'users' | 'audit' | 'ml-health')} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">
                <BarChart2 className="mr-2 h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="users">
                <Users className="mr-2 h-4 w-4" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="audit">
                <Activity className="mr-2 h-4 w-4" />
                Audit Logs
              </TabsTrigger>
              <TabsTrigger value="ml-health">
                <Brain className="mr-2 h-4 w-4" />
                ML Health
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* User Stats Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.userStats.totalUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Registered in system</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Admins</CardTitle>
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">{analytics?.userStats.adminCount || 0}</div>
                    <p className="text-xs text-muted-foreground">System administrators</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Teachers</CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{analytics?.userStats.teacherCount || 0}</div>
                    <p className="text-xs text-muted-foreground">Teaching staff</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Students</CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{analytics?.userStats.studentCount || 0}</div>
                    <p className="text-xs text-muted-foreground">Student accounts</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.userStats.activeUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">Currently active</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active (24h)</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.userStats.activeLast24h || 0}</div>
                    <p className="text-xs text-muted-foreground">Logged in last 24 hours</p>
                  </CardContent>
                </Card>
              </div>

              {/* Student Stats */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.studentStats.totalStudents || 0}</div>
                    <p className="text-xs text-muted-foreground">In student database</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Final Score</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.studentStats.avgFinalScore?.toFixed(1) || 'N/A'}</div>
                    <p className="text-xs text-muted-foreground">Class average</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.studentStats.passRate?.toFixed(1) || 'N/A'}%</div>
                    <p className="text-xs text-muted-foreground">Grades A-D</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">At Risk</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{analytics?.studentStats.atRiskCount || 0}</div>
                    <p className="text-xs text-muted-foreground">Need intervention</p>
                  </CardContent>
                </Card>
              </div>

              {/* Grade Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Grade Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analytics?.studentStats.gradeDistribution.map((item) => (
                      <Badge key={item.grade} variant={getGradeVariant(item.grade)} className="text-base px-4 py-2">
                        {item.grade}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Logins */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Login Activity (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Logins</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics?.recentLogins.slice(0, 10).map((log, i) => (
                        <TableRow key={i}>
                          <TableCell>{log.date}</TableCell>
                          <TableCell className="text-right font-medium">{log.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-64"
                  />
                  <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => document.getElementById('create-user-dialog')?.classList.remove('hidden')}>
                  <Users className="mr-2 h-4 w-4" />
                  Create User
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={getRoleVariant(user.role)}>
                              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>{user.student_id || '-'}</TableCell>
                          <TableCell>{user.department || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={user.is_active ? 'success' : 'secondary'}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.last_login_at
                              ? new Date(user.last_login_at).toLocaleDateString()
                              : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleUserStatus(user)}
                              >
                                {user.is_active ? (
                                  <Activity className="h-4 w-4 text-yellow-600" />
                                ) : (
                                  <Activity className="h-4 w-4 text-green-600" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteUser(user.id)}
                              >
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit Logs Tab */}
            <TabsContent value="audit" className="space-y-6">
              <div className="flex gap-2">
                <Input
                  placeholder="Filter by action..."
                  value={auditActionFilter}
                  onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1); }}
                  className="w-64"
                />
                <Button variant="outline" onClick={fetchAuditLogs}>
                  Refresh
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>IP Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.user_name || log.user_email || `User #${log.user_id || 'N/A'}`}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActionVariant(log.action)} className="text-xs">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs capitalize">
                            {log.resource_type}
                            {log.resource_id && ` #${log.resource_id}`}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate">
                            {log.metadata ? JSON.stringify(log.metadata) : '-'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{log.ip_address || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Pagination */}
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage <= 1}>
                  Previous
                </Button>
                <span className="px-4">Page {auditPage}</span>
                <Button variant="outline" size="sm" onClick={() => setAuditPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </TabsContent>

            {/* ML Health Tab */}
            <TabsContent value="ml-health" className="space-y-6">
              {mlHealthLoading ? (
                <div className="animate-pulse space-y-6">
                  <div className="h-8 w-48 bg-muted rounded" />
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-24 bg-card border rounded-lg" />
                    ))}
                  </div>
                  <div className="h-32 bg-card border rounded-lg" />
                </div>
              ) : mlHealthError ? (
                <Card>
                  <CardContent className="pt-8 text-center">
                    <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Failed to load ML health</h3>
                    <p className="text-muted-foreground mb-4">{mlHealthError}</p>
                    <Button variant="outline" onClick={fetchMlHealth}>
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : mlHealth ? (
                <>
                  {/* Status Overview */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-bold">ML Model Health</h2>
                      <p className="text-muted-foreground">Monitor model performance, freshness, and training status</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={
                          mlHealth.status === 'healthy' ? 'success' :
                          mlHealth.status === 'warning' ? 'warning' :
                          mlHealth.status === 'error' ? 'destructive' : 'secondary'
                        }
                        className="text-base px-4 py-2"
                      >
                        {mlHealth.status === 'healthy' && '✓ Healthy'}
                        {mlHealth.status === 'warning' && '⚠ Warning'}
                        {mlHealth.status === 'error' && '✗ Error'}
                        {mlHealth.status === 'unknown' && '? Unknown'}
                      </Badge>
                      <Button variant="outline" onClick={fetchMlHealth}>
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {/* Issues */}
                  {mlHealth.issues.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Issues & Recommendations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {mlHealth.issues.map((issue, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="h-4 w-4" />
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Key Metrics */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Training</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{mlHealth.lastTrainingAt ? new Date(mlHealth.lastTrainingAt).toLocaleDateString() : 'N/A'}</div>
                        <p className="text-xs text-muted-foreground">
                          {mlHealth.modelAgeDays !== null ? `${mlHealth.modelAgeDays} days ago` : 'Unknown'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Training Samples</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{mlHealth.dataInfo?.n_samples || 'N/A'}</div>
                        <p className="text-xs text-muted-foreground">Training records</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Model Size</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{mlHealth.totalModelSizeMB || 0} MB</div>
                        <p className="text-xs text-muted-foreground">Total artifacts</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Training Duration</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {mlHealth.trainingDurationSec ? `${Math.round(mlHealth.trainingDurationSec / 60)} min` : 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">Last training run</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">CV Strategy</CardTitle>
                        <Bot className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm font-bold">{mlHealth.cvStrategy || 'N/A'}</div>
                        <p className="text-xs text-muted-foreground">Cross-validation method</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Regression Metrics */}
                  {mlHealth.regression && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-primary" />
                          Regression Model ({mlHealth.regression.bestModel})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">CV R²</p>
                            <p className="text-2xl font-bold text-primary">
                              {mlHealth.regression.cvR2 ? mlHealth.regression.cvR2.toFixed(4) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CV RMSE</p>
                            <p className="text-2xl font-bold">
                              {mlHealth.regression.cvRMSE ? mlHealth.regression.cvRMSE.toFixed(2) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Train R²</p>
                            <p className="text-2xl font-bold">
                              {mlHealth.regression.trainR2 ? mlHealth.regression.trainR2.toFixed(4) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Overfit Gap</p>
                            <p className={`text-2xl font-bold ${mlHealth.regression.overfitGap > 0.05 ? 'text-destructive' : 'text-green-600'}`}>
                              {(mlHealth.regression.overfitGap * 100).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Classification Metrics */}
                  {mlHealth.classification && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Brain className="h-5 w-5 text-blue-600" />
                          Classification Model ({mlHealth.classification.bestModel})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-5">
                          <div>
                            <p className="text-xs text-muted-foreground">CV Accuracy</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {mlHealth.classification.cvAccuracy ? (mlHealth.classification.cvAccuracy * 100).toFixed(1) + '%' : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CV F1 (Weighted)</p>
                            <p className="text-2xl font-bold">
                              {mlHealth.classification.cvF1Weighted ? (mlHealth.classification.cvF1Weighted * 100).toFixed(1) + '%' : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Train Accuracy</p>
                            <p className="text-2xl font-bold">
                              {mlHealth.classification.trainAccuracy ? (mlHealth.classification.trainAccuracy * 100).toFixed(1) + '%' : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Overfit Gap</p>
                            <p className={`text-2xl font-bold ${mlHealth.classification.overfitGap > 0.15 ? 'text-destructive' : 'text-green-600'}`}>
                              {(mlHealth.classification.overfitGap * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Grade Map</p>
                            <div className="flex flex-wrap gap-1">
                              {mlHealth.classification.gradeMap && Object.entries(mlHealth.classification.gradeMap).map(([grade, idx]) => (
                                <Badge key={grade} variant={getGradeVariant(grade)} className="text-xs">
                                  {grade}={idx}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Model Files */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        Model Artifacts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                            <TableHead>Modified</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(mlHealth.fileStats || {}).map(([fileName, stats]) => (
                            <TableRow key={fileName}>
                              <TableCell className="font-mono text-sm">{fileName}</TableCell>
                              <TableCell className="text-right">
                                {stats.error ? (
                                  <span className="text-destructive">Missing</span>
                                ) : (
                                  `${stats.sizeKB ?? 0} KB`
                                )}
                              </TableCell>
                              <TableCell>
                                {stats.error ? '-' : (stats.modifiedAt ? new Date(stats.modifiedAt).toLocaleString() : '-')}
                              </TableCell>
                              <TableCell>
                                {stats.error ? (
                                  <Badge variant="destructive">Missing</Badge>
                                ) : (
                                  <Badge variant="success">OK</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-8 text-center">
                    <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No ML health data</h3>
                    <Button variant="outline" onClick={fetchMlHealth}>
                      Load ML Health
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
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

function getRoleVariant(role: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (role) {
    case 'admin': return 'destructive';
    case 'teacher': return 'default';
    case 'student': return 'success';
    default: return 'outline';
  }
}

function getActionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (action.includes('CREATE')) return 'success';
  if (action.includes('UPDATE')) return 'default';
  if (action.includes('DELETE')) return 'destructive';
  if (action.includes('LOGIN')) return 'success';
  return 'outline';
}