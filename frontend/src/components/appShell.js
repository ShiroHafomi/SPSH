export const ROLE_NAVIGATION = Object.freeze({
  admin: [
    {
      labelKey: 'shell.groups.overview',
      items: [
        { to: '/admin', labelKey: 'admin.overview', icon: 'dashboard', exact: true },
        { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'lineChart', exact: true },
      ],
    },
    {
      labelKey: 'shell.groups.people',
      items: [
        { to: '/admin/students', labelKey: 'admin.studentManagement', icon: 'users' },
        { to: '/admin/at-risk', labelKey: 'admin.atRiskStudents', icon: 'alertTriangle' },
        { to: '/admin/users', labelKey: 'admin.userManagement', icon: 'user' },
      ],
    },
    {
      labelKey: 'shell.groups.intelligence',
      items: [
        { to: '/admin/ai-tools', labelKey: 'admin.aiTools', icon: 'brain' },
        { to: '/predictor', labelKey: 'nav.aiCounselor', icon: 'sparkles', exact: true },
        { to: '/what-if', labelKey: 'nav.whatIfSimulator', icon: 'sliders', exact: true },
        { to: '/admin/ml-monitoring', labelKey: 'mlMonitoring.nav', icon: 'activity' },
      ],
    },
    {
      labelKey: 'shell.groups.account',
      items: [
        { to: '/admin/notifications', labelKey: 'notifications.title', icon: 'bell' },
      ],
    },
  ],
  teacher: [
    {
      labelKey: 'shell.groups.overview',
      items: [
        { to: '/teacher', labelKey: 'teacher.dashboardTitle', icon: 'dashboard', exact: true },
        { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'lineChart', exact: true },
      ],
    },
    {
      labelKey: 'shell.groups.people',
      items: [
        { to: '/teacher/students', labelKey: 'nav.students', icon: 'users' },
        { to: '/teacher/at-risk', labelKey: 'teacher.atRiskStudents', icon: 'alertTriangle' },
      ],
    },
    {
      labelKey: 'shell.groups.intelligence',
      items: [
        { to: '/predictor', labelKey: 'nav.aiCounselor', icon: 'sparkles', exact: true },
        { to: '/what-if', labelKey: 'nav.whatIfSimulator', icon: 'sliders', exact: true },
        { to: '/teacher/ml-monitoring', labelKey: 'mlMonitoring.nav', icon: 'activity' },
      ],
    },
    {
      labelKey: 'shell.groups.account',
      items: [
        { to: '/teacher/notifications', labelKey: 'notifications.title', icon: 'bell' },
      ],
    },
  ],
  student: [
    {
      labelKey: 'shell.groups.overview',
      items: [
        { to: '/student', labelKey: 'student.overview', icon: 'home', exact: true },
        { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'lineChart', exact: true },
      ],
    },
    {
      labelKey: 'shell.groups.planning',
      items: [
        { to: '/goals', labelKey: 'nav.goals', icon: 'target', exact: true },
        { to: '/student/assignments', labelKey: 'nav.assignments', icon: 'fileText' },
        { to: '/student/study-planner', labelKey: 'nav.studyPlanner', icon: 'calendar' },
      ],
    },
    {
      labelKey: 'shell.groups.intelligence',
      items: [
        { to: '/predictor', labelKey: 'nav.aiCounselor', icon: 'sparkles', exact: true },
        { to: '/what-if', labelKey: 'nav.whatIfSimulator', icon: 'sliders', exact: true },
      ],
    },
    {
      labelKey: 'shell.groups.account',
      items: [
        { to: '/student/notifications', labelKey: 'notifications.title', icon: 'bell' },
      ],
    },
  ],
});

export function getNavigationForRole(role) {
  return ROLE_NAVIGATION[role] || [];
}

export function isNavigationItemActive(pathname, item) {
  if (!item?.to || typeof pathname !== 'string') return false;
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function getPageContext(role, pathname) {
  const items = getNavigationForRole(role).flatMap((group) => group.items);
  return items
    .filter((item) => isNavigationItemActive(pathname, item))
    .sort((left, right) => right.to.length - left.to.length)[0] || null;
}

export function getDrawerStateAfterAction(currentState, action) {
  if (action === 'open') return true;
  if (action === 'close' || action === 'navigate' || action === 'escape') return false;
  if (action === 'toggle') return !currentState;
  return currentState;
}
