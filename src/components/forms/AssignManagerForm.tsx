import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fastAPI } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface AssignManagerFormProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onManagerAssigned: () => void;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const AssignManagerForm: React.FC<AssignManagerFormProps> = ({
  projectId,
  projectName,
  onClose,
  onManagerAssigned
}) => {
  const [managers, setManagers] = useState<User[]>([]);
  const [selectedManager, setSelectedManager] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'project_manager' | 'vdcr_manager'>('project_manager');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .in('role', ['project_manager', 'vdcr_manager'])
        .eq('is_active', true);

      if (error) throw error;
      setManagers(users || []);
    } catch (error) {
      console.error('Error fetching managers:', error);
      setError('Failed to fetch managers');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManager) {
      setError('Please select a manager');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      
      await fastAPI.assignManagerToProject({
        user_id: selectedManager,
        project_id: projectId,
        role: selectedRole,
        assigned_by: userData.id
      });

      setSuccess(`${selectedRole.replace('_', ' ')} assigned successfully!`);
      onManagerAssigned();
      
      // Close form after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error assigning manager:', error);
      setError(error.message || 'Failed to assign manager');
    } finally {
      setLoading(false);
    }
  };

  const filteredManagers = managers.filter(manager => manager.role === selectedRole);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Assign Manager to Project</CardTitle>
          <CardDescription>
            Assign a {selectedRole.replace('_', ' ')} to "{projectName}"
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="role">Manager Role</Label>
              <Select value={selectedRole} onValueChange={(value: 'project_manager' | 'vdcr_manager') => setSelectedRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="vdcr_manager">Documentation Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="manager">Select Manager</Label>
              <Select value={selectedManager} onValueChange={setSelectedManager}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a manager" />
                </SelectTrigger>
                <SelectContent>
                  {filteredManagers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.full_name} ({manager.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={loading || !selectedManager}
                className="flex-1"
              >
                {loading ? 'Assigning...' : 'Assign Manager'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssignManagerForm;

