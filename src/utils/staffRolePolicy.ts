export const STAFF_ROLE_ORDER = [
  'testExecutor',
  'testManager',
  'testLead',
  'resourceManager',
  'projectManager',
  'fieldAdmin',
] as const;

const MANAGER_ROLES = new Set(['admin', 'resourceManager', 'projectManager', 'fieldAdmin']);
const PROJECT_MANAGER_ASSIGNABLE = new Set([
  'testExecutor', 'testManager', 'resourceManager', 'testLead',
]);

export function isRestrictedTestLead(actorRoles: readonly string[]) {
  return actorRoles.includes('testLead')
    && !actorRoles.some(role => MANAGER_ROLES.has(role));
}

export function getAssignableStaffRoles(actorRoles: readonly string[]): string[] {
  if (actorRoles.includes('admin')) return [...STAFF_ROLE_ORDER];

  const allowed = new Set<string>();
  if (actorRoles.includes('projectManager')) {
    PROJECT_MANAGER_ASSIGNABLE.forEach(role => allowed.add(role));
  }
  if (actorRoles.some(role => ['resourceManager', 'fieldAdmin', 'testLead'].includes(role))) {
    allowed.add('testExecutor');
  }
  return STAFF_ROLE_ORDER.filter(role => allowed.has(role));
}

export function getStaffTargetRoles(target: { roles?: string[]; role?: string }) {
  if (target.roles?.length) return [...new Set(target.roles)];
  return [target.role || 'testExecutor'];
}

export function canAssignStaffRoles(actorRoles: readonly string[], targetRoles: readonly string[]) {
  const allowed = new Set(getAssignableStaffRoles(actorRoles));
  return targetRoles.length > 0
    && !targetRoles.includes('admin')
    && targetRoles.every(role => allowed.has(role));
}

export function canCreateStaff(actorRoles: readonly string[]) {
  return !isRestrictedTestLead(actorRoles)
    && getAssignableStaffRoles(actorRoles).length > 0;
}

export function canEditStaff(
  actorRoles: readonly string[],
  actorTestType: string | undefined,
  target: { roles?: string[]; role?: string; testType?: string },
) {
  if (!canAssignStaffRoles(actorRoles, getStaffTargetRoles(target))) return false;
  return !isRestrictedTestLead(actorRoles)
    || Boolean(actorTestType && actorTestType === target.testType);
}

export function canDeleteStaff(
  actorRoles: readonly string[],
  target: { roles?: string[]; role?: string },
) {
  return !isRestrictedTestLead(actorRoles)
    && canAssignStaffRoles(actorRoles, getStaffTargetRoles(target));
}

export function canChangeStaffRoles(actorRoles: readonly string[]) {
  return !isRestrictedTestLead(actorRoles);
}

export function getStaffRoleOptions(
  actorRoles: readonly string[],
  currentRoles: readonly string[] = [],
) {
  const assignable = getAssignableStaffRoles(actorRoles);
  const assignableSet = new Set(assignable);
  const protectedCurrent = currentRoles.filter(role => !assignableSet.has(role));
  return [...assignable, ...protectedCurrent.filter((role, index) => (
    protectedCurrent.indexOf(role) === index
  ))].map(role => ({
    role,
    disabled: !assignableSet.has(role) || !canChangeStaffRoles(actorRoles),
  }));
}
