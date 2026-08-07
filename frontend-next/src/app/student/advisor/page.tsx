'use client';

import { useEffect, useState } from 'react';
import { Brain, BookOpen, Moon, Target, AlertTriangle, CheckCircle, TrendingUp, Lightbulb, Heart, Award, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Cookies from 'js-cookie';

interface AdvisorResponse {
  studentId: number;
  name: string;
  currentGrade: string;
  currentScore: number;
  advice: {
    overview: string;
    strengths: string[];
    improvements: string[];
    actionPlan: string[];
    encouragement: string;
  };
}

export default function StudentAdvisorPage() {
  const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdvisor();
  }, []);

  const fetchAdvisor = async () => {
    try {
      const token = Cookies.get('access_token');
      const res = await fetch('http://localhost:3001/api/student/me/advisor', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch advisor');
      const data = await res.json();
      setAdvisor(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load advisor');
    } finally {
      setLoading(false);
    }
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

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Failed to load advisor</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={fetchAdvisor} className="mt-4">Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-8 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">AI Academic Advisor</h1>
                <p className="text-muted-foreground mt-1">Personalized recommendations based on your performance and habits</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{advisor?.currentScore?.toFixed(1) || 'N/A'}</div>
                  <div className="text-sm text-muted-foreground">Current Score</div>
                </div>
                <Badge variant={getGradeVariant(advisor?.currentGrade || '')} className="text-xl px-4 py-3">
                  Grade: {advisor?.currentGrade}
                </Badge>
              </div>
            </div>
          </div>

          {/* Overview */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Academic Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg leading-relaxed">{advisor?.advice?.overview}</p>
            </CardContent
          </Card>

          {/* Strengths */}
          {advisor?.advice?.strengths && advisor.advice.strengths.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Your Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {advisor.advice.strengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-green-900 dark:text-green-100">{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent
            </Card>
          )}

          {/* Areas for Improvement */}
          {advisor?.advice?.improvements && advisor.advice.improvements.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {advisor.advice.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <span className="text-yellow-900 dark:text-yellow-100">{improvement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent
            </Card>
          )}

          {/* Action Plan */}
          {advisor?.advice?.actionPlan && advisor.advice.actionPlan.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Recommended Action Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {advisor.advice.actionPlan.map((action, index) => (
                    <li key={index} className="flex items-start gap-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-primary">{action}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent
            </Card>
          )}

          {/* Encouragement */}
          {advisor?.advice?.encouragement && (
            <Card className="mb-6 bg-gradient-to-r from-primary/10 to-purple/10 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  A Message for You
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg italic leading-relaxed text-primary-foreground">{advisor.advice.encouragement}</p>
              </CardContent
            </Card>
          )}

          {/* Quick Tips Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-500" />
                  Study Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Use active recall and spaced repetition</p>
                <p className="text-muted-foreground">Break study sessions into 25-min blocks (Pomodoro)</p>
                <p className="text-muted-foreground">Teach concepts to someone else to verify understanding</p>
              </CardContent
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="h-5 w-5 text-purple-500" />
                  Sleep & Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Aim for 7-9 hours of quality sleep</p>
                <p className="text-muted-foreground">Avoid screens 1 hour before bed</p>
                <p className="text-muted-foreground">Stay hydrated and exercise regularly</p>
              </CardContent
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  Goal Setting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Set specific, measurable weekly goals</p>
                <p className="text-muted-foreground">Track progress in a study journal</p>
                <p className="text-muted-foreground">Celebrate small wins along the way</p>
              </CardContent
            </Card>
          </div>

          {/* Refresh Button */}
          <div className="mt-8 text-center">
            <Button variant="outline" onClick={fetchAdvisor}>
              <Brain className="mr-2 h-4 w-4" />
              Get Updated Advice
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Advice is generated based on your current academic data and habits
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}