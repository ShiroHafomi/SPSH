import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-12 flex-col items-center justify-center">
        <div className="max-w-md text-center">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-3xl text-primary mb-8">
            <GraduationCap className="h-10 w-10" />
            Student Performance
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-6">
            Academic Performance & Study Habits Platform
          </h1>
          <p className="text-lg text-muted-foreground">
            A comprehensive multi-role system for tracking student performance,
            identifying at-risk students, and providing AI-powered academic counseling.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-card border">
              <div className="text-3xl font-bold text-primary">3</div>
              <div className="text-sm text-muted-foreground">Roles</div>
            </div>
            <div className="p-4 rounded-lg bg-card border">
              <div className="text-3xl font-bold text-primary">AI</div>
              <div className="text-sm text-muted-foreground">Powered</div>
            </div>
            <div className="p-4 rounded-lg bg-card border">
              <div className="text-3xl font-bold text-primary">24/7</div>
              <div className="text-sm text-muted-foreground">Access</div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}