const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8080/api`;

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const result: ApiResponse<T> = await response.json();

    if (result.code !== 200) {
      throw new Error(result.message || '请求失败');
    }

    return result.data;
  }

  // Auth
  async login(username: string, password: string) {
    const data = await this.request<{
      token: string;
      username: string;
      role: string;
      roles: string[];
      displayName: string;
      testType?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  async changePassword(oldPassword: string, newPassword: string, confirmPassword: string) {
    return this.request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
    });
  }

  async register(data: { username: string; password: string; confirmPassword: string; displayName: string; role: string }) {
    return this.request<void>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPendingApprovals() {
    return this.request<any[]>('/auth/pending-approvals');
  }

  async approveUser(id: number) {
    return this.request<void>(`/auth/approve/${id}`, { method: 'PUT' });
  }

  async rejectUser(id: number) {
    return this.request<void>(`/auth/reject/${id}`, { method: 'PUT' });
  }

  async batchApproveUsers(ids: number[]) {
    return this.request<void>('/auth/batch-approve', {
      method: 'PUT',
      body: JSON.stringify(ids),
    });
  }

  async batchRejectUsers(ids: number[]) {
    return this.request<void>('/auth/batch-reject', {
      method: 'PUT',
      body: JSON.stringify(ids),
    });
  }

  // Test Demands
  async getDemands() {
    return this.request<any[]>('/demands');
  }

  async getPendingDemands() {
    return this.request<any[]>('/demands/pending');
  }

  async getDemand(id: number) {
    return this.request<any>(`/demands/${id}`);
  }

  async createDemand(demand: any) {
    return this.request<any>('/demands', {
      method: 'POST',
      body: JSON.stringify(demand),
    });
  }

  async updateDemand(id: number, demand: any) {
    return this.request<any>(`/demands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(demand),
    });
  }

  async deleteDemand(id: number) {
    return this.request<void>(`/demands/${id}`, {
      method: 'DELETE',
    });
  }

  async closeDemand(id: number) {
    return this.request<any>(`/demands/${id}/close`, {
      method: 'POST',
    });
  }

  async getPendingDemandApprovals() {
    return this.request<any[]>('/demands/pending-approval');
  }

  async approveDemand(id: number) {
    return this.request<any>(`/demands/${id}/approve`, { method: 'PUT' });
  }

  async approveDemandWithChanges(id: number, data: any) {
    return this.request<any>(`/demands/${id}/approve-with-changes`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateDemandPriority(id: number, priority: string) {
    return this.request<any>(`/demands/${id}/priority`, {
      method: 'PUT',
      body: JSON.stringify({ priority }),
    });
  }

  async rejectDemand(id: number) {
    return this.request<void>(`/demands/${id}/reject`, { method: 'PUT' });
  }

  async batchApproveDemands(ids: number[]) {
    return this.request<void>('/demands/batch-approve', {
      method: 'PUT',
      body: JSON.stringify(ids),
    });
  }

  async batchRejectDemands(ids: number[]) {
    return this.request<void>('/demands/batch-reject', {
      method: 'PUT',
      body: JSON.stringify(ids),
    });
  }

  // Schedules
  async getSchedules() {
    return this.request<any[]>('/schedules');
  }

  async getSchedulesByDate(date: string) {
    return this.request<any[]>(`/schedules/date/${date}`);
  }

  async getSchedulesByRange(startDate: string, endDate: string) {
    return this.request<any[]>(`/schedules/range?startDate=${startDate}&endDate=${endDate}`);
  }

  async getPublishedSchedules() {
    return this.request<any[]>('/schedules/published');
  }

  async publishSchedules(demandId: number) {
    return this.request<void>(`/schedules/publish/${demandId}`, {
      method: 'PUT',
    });
  }

  async unpublishSchedules(demandId: number) {
    return this.request<void>(`/schedules/unpublish/${demandId}`, {
      method: 'PUT',
    });
  }

  async createSchedule(schedule: any) {
    return this.request<any>('/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    });
  }

  async createSchedulesBatch(schedules: any[]) {
    return this.request<any[]>('/schedules/batch', {
      method: 'POST',
      body: JSON.stringify(schedules),
    });
  }

  async deleteSchedule(id: number) {
    return this.request<void>(`/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteSchedulesByDemand(demandId: number) {
    return this.request<void>(`/schedules/demand/${demandId}`, {
      method: 'DELETE',
    });
  }

  // Staff
  async getStaff() {
    return this.request<any[]>('/staff');
  }

  async getActiveStaff() {
    return this.request<any[]>('/staff/active');
  }

  async getStaffById(id: number) {
    return this.request<any>(`/staff/${id}`);
  }

  async createStaff(staff: any) {
    return this.request<{ staff: any; generatedPassword: string }>('/staff', {
      method: 'POST',
      body: JSON.stringify(staff),
    });
  }

  async getStaffRoleByEmpNo(empNo: string) {
    return this.request<string>(`/staff/role/${empNo}`);
  }

  async getStaffRolesByEmpNo(empNo: string) {
    return this.request<string[]>(`/staff/roles/${empNo}`);
  }

  async updateStaff(id: number, staff: any) {
    return this.request<any>(`/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(staff),
    });
  }

  async deleteStaff(id: number) {
    return this.request<void>(`/staff/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteStaffsBatch(ids: number[]) {
    return this.request<void>('/staff/batch', {
      method: 'DELETE',
      body: JSON.stringify(ids),
    });
  }

  // Daily Availability Statuses
  async getDailyStatuses(startDate: string, endDate: string) {
    return this.request<any[]>(`/daily-statuses?startDate=${startDate}&endDate=${endDate}`);
  }

  async setDailyStatus(staffId: number, date: string, status: string, percentage?: number) {
    return this.request<void>('/daily-statuses', {
      method: 'PUT',
      body: JSON.stringify({ staffId, date, status, percentage }),
    });
  }

  // Field Configs
  async getFieldConfigs() {
    return this.request<any[]>('/field-configs');
  }

  async getFieldConfigByName(fieldName: string) {
    return this.request<any>(`/field-configs/name/${fieldName}`);
  }

  async createFieldConfig(config: any) {
    return this.request<any>('/field-configs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateFieldConfig(id: number, config: any) {
    return this.request<any>(`/field-configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteFieldConfig(id: number) {
    return this.request<void>(`/field-configs/${id}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
export default api;
