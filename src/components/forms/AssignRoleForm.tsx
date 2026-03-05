import React, { useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, UserPlus, Users } from 'lucide-react';
import { fastAPI } from '@/lib/api';

interface AssignRoleFormProps {
  currentUserRole: string;
  firmId?: string;
  projectId?: string;
  onRoleAssigned: () => void;
  onClose: () => void;
}

interface FormData {
  email: string;
  fullName: string;
  role: string;
}

const AssignRoleForm: React.FC<AssignRoleFormProps> = ({
  currentUserRole,
  firmId,
  projectId,
  onRoleAssigned,
  onClose
}) => {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    fullName: '',
    role: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get available roles based on current user's role
  const getAvailableRoles = () => {
    switch (currentUserRole) {
      case 'firm_admin':
        return [
          { value: 'project_manager', label: 'Project Manager' },
          { value: 'vdcr_manager', label: 'Documentation Manager' }
        ];
      case 'project_manager':
      case 'vdcr_manager':
        return [
          { value: 'editor', label: 'Editor' },
          { value: 'viewer', label: 'Viewer' }
        ];
      default:
        return [];
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const assignedBy = userData.id;

      if (!assignedBy) {
        throw new Error('User not authenticated');
      }

      if (currentUserRole === 'firm_admin') {
        // Firm admin assigning project roles
        await fastAPI.assignProjectRole({
          email: formData.email,
          full_name: formData.fullName,
          role: formData.role as 'project_manager' | 'vdcr_manager',
          project_id: projectId!,
          assigned_by: assignedBy
        });
      } else {
        // Project/VDCR manager assigning team roles
        await fastAPI.assignTeamRole({
          email: formData.email,
          full_name: formData.fullName,
          role: formData.role as 'editor' | 'viewer',
          project_id: projectId!,
          assigned_by: assignedBy
        });
      }

      // Send email notification
      try {
        const { sendEmailNotification } = await import('@/lib/notifications');
        await sendEmailNotification({
          admin_name: formData.fullName,
          admin_email: formData.email,
          company_name: 'Your Company', // This should come from context
          role: formData.role,
          dashboard_url: `${window.location.origin}/signup`
        });
      } catch (notificationError) {
        console.error('Email notification failed:', notificationError);
      }

      toast({ title: 'Success', description: `Role assigned successfully!\n\n👤 ${formData.fullName} has been assigned the role: ${formData.role}\n📧 An invitation email has been sent to ${formData.email}\n\nThe user can now sign up and access their dashboard.` });

      onRoleAssigned();
      onClose();
    } catch (error: any) {
      console.error('Error assigning role:', error);
      setError(error.message || 'Failed to assign role');
    } finally {
      setLoading(false);
    }
  };

  const availableRoles = getAvailableRoles();

  if (availableRoles.length === 0) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Assign Role
          </CardTitle>
          <CardDescription>
            You don't have permission to assign roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign Role
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Assign a role to a new team member
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Enter full name"
              value={formData.fullName}
              onChange={(e) => handleInputChange('fullName', e.target.value)}
              required
            />
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
            />
          </div>

          {/* Role */}
          <div>
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => handleInputChange('role', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Assigning Role...' : 'Assign Role'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AssignRoleForm;
