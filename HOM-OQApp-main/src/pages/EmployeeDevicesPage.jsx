import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Sidebar } from '../components/Sidebar';
import { UserAuth } from '../context/AuthContext';
import { supabase } from '../supabase/supabase.config';
import {
  FaSearch,
  FaMobileAlt,
  FaLaptop,
  FaTabletAlt,
  FaDesktop,
  FaCheckSquare,
  FaRegSquare,
  FaFilter,
  FaCalendarPlus,
  FaTimes,
  FaUndo,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaExclamationTriangle,
  FaSync,
  FaInfoCircle,
  FaPlus,
} from 'react-icons/fa';
import Swal from 'sweetalert2';

// ================== UTILS ==================

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

const normalizeString = (str) => {
  if (!str && str !== 0) return '';
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const cleanStatusString = (status) => {
  if (status === null || status === undefined) return '';
  return String(status).replace(/\s+/g, ' ').trim().toLowerCase();
};

const isPendingStatus = (status) => cleanStatusString(status).includes('pending');

const getDeviceIcon = (type) => {
  const t = typeof type === 'string' ? type.toLowerCase() : '';
  if (t.includes('laptop')) return <FaLaptop />;
  if (t.includes('phone') || t.includes('iphone')) return <FaMobileAlt />;
  if (t.includes('tablet') || t.includes('ipad')) return <FaTabletAlt />;
  return <FaDesktop />;
};

const formatCompactName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') return 'Unknown';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return fullName;
};

// ======== assignment classifiers ========
const isSelfAssigned = (dev, currentUserId) => {
  return dev?.assigned_by_user_id === currentUserId || (!dev?.fixed_assignment && !dev?.assigned_by_user_id);
};

const isTLAssigned = (dev, currentUserId) => {
  return !isSelfAssigned(dev, currentUserId);
};

const isHomeOfficeDevice = (dev) => {
  const status = cleanStatusString(dev?.status);
  return status === 'taken_ho' || Number(dev?.location_id) === 2;
};

// Hook for logs
const useDeviceLogger = (user) => {
  const logAction = useCallback(
    async (deviceId, action, description, location = 'Office') => {
      if (!user?.id || !deviceId) return;
      try {
        const payload = {
          device_id: deviceId,
          user_id: user.id,
          action,
          description,
          location,
          created_at: new Date().toISOString(),
        };
        supabase.from('device_logs').insert(payload).then(({ error }) => {
          if (error) console.warn('[device_logs] insert error:', error);
        });
      } catch (err) {
        console.error('[device_logs] insert exception:', err);
      }
    },
    [user]
  );
  return logAction;
};

// ================== MODAL: RETURN SELECTION ==================

const ReturnSelectionModal = ({ isOpen, onClose, devices, onConfirm, currentUserId, isProcessing }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setIsClosing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleClose = () => {
    if (isProcessing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 250);
  };

  const handleSubmit = () => {
    onConfirm(selectedIds);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === devices.length) setSelectedIds([]);
    else setSelectedIds(devices.map((d) => d.id));
  };

  const count = selectedIds.length;

  return (
    <ModalBackdrop $closing={isClosing} onClick={handleClose}>
      <FilterContent $closing={isClosing} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Return Devices</h3>
          <CloseBtn onClick={handleClose} disabled={isProcessing} aria-label="Close">
            <FaTimes />
          </CloseBtn>
        </ModalHeader>

        <InfoBox>
          <FaInfoCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0 }}>
              <b>All</b> items in this list will be <b>returned</b>.
            </p>
            <p style={{ margin: '6px 0 0 0' }}>
              <b>Checked</b> = try to <b>unassign immediately</b>
            </p>
            <ul style={{ margin: '8px 0 0 15px', padding: 0, fontSize: '0.82em', opacity: 0.95 }}>
              <li>
                <b>HO</b> and <b>TL assigned</b> devices go to <b>pending_review</b> and <b>stay assigned</b> (if checked it unassign).
              </li>
              <li>
                <b>Self + Office</b> checked devices go to <b>available</b> and get <b>unassigned</b>.
              </li>
            </ul>
          </div>
        </InfoBox>

        <ActionBar>
          <span className="count">{count} selected to unassign</span>
          <SmallButton onClick={handleSelectAll} disabled={isProcessing}>
            {count === devices.length ? 'Uncheck All' : 'Check All'}
          </SmallButton>
        </ActionBar>

        <SelectionList>
          {devices.map((dev) => {
            const isSelected = selectedIds.includes(dev.id);
            const ho = isHomeOfficeDevice(dev);
            const self = isSelfAssigned(dev, currentUserId);
            const tl = isTLAssigned(dev, currentUserId);

            return (
              <SelectionItem
                key={dev.id}
                $selected={isSelected}
                onClick={() => !isProcessing && toggleSelection(dev.id)}
                $disabled={isProcessing}
                title={
                  ho
                    ? 'Home Office device: will stay assigned and go to pending_review'
                    : tl
                    ? 'TL assigned device: will stay assigned and go to pending_review'
                    : 'Self + Office: if checked, will be unassigned and set available'
                }
              >
                <div className="checkbox-icon">
                  {isSelected ? <FaCheckSquare color="#fa5252" size={24} /> : <FaRegSquare color="#ccc" size={24} />}
                </div>

                <div className="info">
                  <span className="name">{dev.name || dev.model}</span>
                  <span className="meta">{dev.asset_tag}</span>
                </div>

                <div className="status-indicator">
                  {ho ? (
                    <Badge $color="#fff3bf" $textColor="#f08c00">HO</Badge>
                  ) : tl ? (
                    <Badge $color="#e0e7ff" $textColor="#3b5bdb">TL</Badge>
                  ) : self ? (
                    <Badge $color="#d3f9d8" $textColor="#2b8a3e">Self</Badge>
                  ) : (
                    <Badge $color="#f1f3f5" $textColor="#495057">Assigned</Badge>
                  )}
                </div>
              </SelectionItem>
            );
          })}
          {devices.length === 0 && <EmptyList>No devices to return.</EmptyList>}
        </SelectionList>

        <ModalFooter>
          <Button secondary onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            primary={count === 0}
            $danger={count > 0}
            onClick={handleSubmit}
            disabled={isProcessing || devices.length === 0}
            style={{ minWidth: '190px' }}
          >
            {isProcessing ? 'Processing...' : count > 0 ? `Return + Unassign (${count})` : 'Return (Keep Assigned)'}
          </Button>
        </ModalFooter>
      </FilterContent>
    </ModalBackdrop>
  );
};

// ================== MODAL: ADD DEVICE (SMART VALIDATION) ==================

const AddDeviceModal = ({ isOpen, onClose, teamId, onDeviceAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    asset_tag: '',
    serial_number: '',
    brand: '',
    model: '',
    device_type: '' 
  });

  const [existingTypes, setExistingTypes] = useState([]);
  const [isManualType, setIsManualType] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        asset_tag: '',
        serial_number: '',
        brand: '',
        model: '',
        device_type: 'Laptop'
      });
      setIsManualType(false);
      setIsClosing(false);
      fetchDeviceTypes();
    }
  }, [isOpen]);

  const fetchDeviceTypes = async () => {
    setLoadingTypes(true);
    const { data, error } = await supabase
      .from('devices')
      .select('device_type')
      .not('device_type', 'is', null);

    if (!error && data) {
      const uniqueTypes = [...new Set(data.map(d => d.device_type))].sort((a, b) => a.localeCompare(b));
      setExistingTypes(uniqueTypes);
      
      if (uniqueTypes.includes('Laptop')) {
        setFormData(prev => ({ ...prev, device_type: 'Laptop' }));
      } else if (uniqueTypes.length > 0) {
        setFormData(prev => ({ ...prev, device_type: uniqueTypes[0] }));
      }
    }
    setLoadingTypes(false);
  };

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'device_type_select') {
      if (value === '__NEW__') {
        setIsManualType(true);
        setFormData(prev => ({ ...prev, device_type: '' }));
      } else {
        setIsManualType(false);
        setFormData(prev => ({ ...prev, device_type: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 250);
  };

  const checkDuplicatesInDB = async () => {
    const { data: tags, error: tagError } = await supabase
      .from('devices').select('id').eq('asset_tag', formData.asset_tag);
    if (tagError) throw tagError;
    if (tags && tags.length > 0) throw new Error(`The Asset Tag "${formData.asset_tag}" is already assigned.`);

    if (formData.serial_number && formData.serial_number.trim() !== '') {
      const { data: serials, error: serialError } = await supabase
        .from('devices').select('id').eq('serial_number', formData.serial_number.trim());
      if (serialError) throw serialError;
      if (serials && serials.length > 0) throw new Error(`The Serial Number "${formData.serial_number}" is already registered.`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return Toast.fire({ icon: 'warning', title: 'Device Name is required.' });
    if (!formData.asset_tag) return Toast.fire({ icon: 'warning', title: 'Asset Tag is required.' });
    if (!formData.device_type.trim()) return Toast.fire({ icon: 'warning', title: 'Device Type is required.' });

    if (isManualType) {
      const inputType = formData.device_type.trim();
      const match = existingTypes.find(t => t.toLowerCase() === inputType.toLowerCase());
      if (match) {
        await Swal.fire({
          title: 'Type Already Exists',
          text: `The category "${match}" already exists. Please select it from the dropdown list.`,
          icon: 'warning',
          confirmButtonColor: '#3b5bdb'
        });
        return; 
      } else {
        const confirmResult = await Swal.fire({
          title: 'Create New Category?',
          html: `You are about to create: <b>"${inputType}"</b>.<br/><span style="font-size:0.9em; color:#666">Are you sure?</span>`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#3b5bdb',
          confirmButtonText: 'Yes, create it'
        });
        if (!confirmResult.isConfirmed) return;
      }
    }

    setIsSubmitting(true);
    try {
      await checkDuplicatesInDB();
      const { error } = await supabase.from('devices').insert({
        name: formData.name.trim(),
        asset_tag: formData.asset_tag,
        serial_number: formData.serial_number ? formData.serial_number.trim() : null,
        brand: formData.brand.trim(),
        model: formData.model.trim(),
        device_type: formData.device_type.trim(),
        team_id: teamId,
        status: 'available',
        location_id: 1,
        is_available: true,
        assignment_source: 'team_lead'
      });
      if (error) throw error;
      Toast.fire({ icon: 'success', title: 'Device added successfully' });
      onDeviceAdded();
      handleClose();
    } catch (err) {
      console.error("Add Device Error:", err);
      let message = err.message || "An unexpected error occurred.";
      if (err.code === '23505') message = "Duplicate entry found (Serial or Asset Tag).";
      Swal.fire({ title: 'Error', text: message, icon: 'error', confirmButtonColor: '#3b5bdb' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalBackdrop $closing={isClosing} onClick={handleClose}>
      <FilterContent $closing={isClosing} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Add New Device</h3>
          <CloseBtn onClick={handleClose} type="button"><FaTimes /></CloseBtn>
        </ModalHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, overflowY: 'auto' }}>
          <FilterGroup>
            <label>Device Name *</label>
            <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. MacBook Pro 16" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
          </FilterGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <FilterGroup>
              <label>Asset Tag *</label>
              <input name="asset_tag" type="number" value={formData.asset_tag} onChange={handleChange} placeholder="e.g. 22045" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
            </FilterGroup>
            <FilterGroup>
              <label>Device Type *</label>
              {isManualType ? (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input name="device_type" value={formData.device_type} onChange={handleChange} placeholder="Type new category..." autoFocus style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #3b5bdb', background: '#f8f9fa' }} />
                  <Button type="button" onClick={() => { setIsManualType(false); setFormData(prev => ({ ...prev, device_type: existingTypes[0] || 'Laptop' })); }} style={{ padding: '0 10px', background: '#e9ecef', color: '#333' }}><FaUndo /></Button>
                </div>
              ) : (
                <select name="device_type_select" value={formData.device_type} onChange={handleChange} disabled={loadingTypes} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}>
                  {loadingTypes ? <option>Loading...</option> : <>{existingTypes.map(t => <option key={t} value={t}>{t}</option>)}<option disabled>──────────</option><option value="__NEW__" style={{ fontWeight: 'bold', color: '#3b5bdb' }}>➕ Create New Type</option></>}
                </select>
              )}
            </FilterGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <FilterGroup>
              <label>Brand</label>
              <input name="brand" value={formData.brand} onChange={handleChange} placeholder="e.g. Apple" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
            </FilterGroup>
            <FilterGroup>
              <label>Model</label>
              <input name="model" value={formData.model} onChange={handleChange} placeholder="e.g. M3 Max" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
            </FilterGroup>
          </div>
          <FilterGroup>
            <label>Serial Number</label>
            <input name="serial_number" value={formData.serial_number} onChange={handleChange} placeholder="Unique S/N" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
          </FilterGroup>
          <ModalFooter style={{ marginTop: 'auto' }}>
            <Button type="button" secondary onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" primary disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Add Device'}</Button>
          </ModalFooter>
        </form>
      </FilterContent>
    </ModalBackdrop>
  );
};

// ================== MODAL: FILTER ==================

const FilterModal = ({ isOpen, onClose, onApply, currentFilters, uniqueValues }) => {
  const [localFilters, setLocalFilters] = useState(currentFilters);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(currentFilters);
      setIsClosing(false);
    }
  }, [isOpen, currentFilters]);

  if (!isOpen) return null;

  const handleChange = (key, value) => setLocalFilters((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { onClose(); setIsClosing(false); }, 250);
  };

  const handleApply = () => { onApply(localFilters); handleClose(); };
  const handleClear = () => {
    const empty = { status: '', device_type: '', brand: '', operating_system: '' };
    setLocalFilters(empty);
    onApply(empty);
    handleClose();
  };

  return (
    <ModalBackdrop $closing={isClosing} onClick={handleClose}>
      <FilterContent $closing={isClosing} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Filter Devices</h3>
          <CloseBtn onClick={handleClose}><FaTimes /></CloseBtn>
        </ModalHeader>
        <FilterBody>
          <FilterGroup>
            <label>Status</label>
            <select value={localFilters.status} onChange={(e) => handleChange('status', e.target.value)}>
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="taken_ho">Home Office</option>
              <option value="pending_review">Pending</option>
            </select>
          </FilterGroup>
          <FilterGroup>
            <label>Type</label>
            <select value={localFilters.device_type} onChange={(e) => handleChange('device_type', e.target.value)}>
              <option value="">All</option>
              {uniqueValues.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FilterGroup>
        </FilterBody>
        <ModalFooter>
          <Button secondary onClick={handleClear}>Clear</Button>
          <Button primary onClick={handleApply}>Apply Filters</Button>
        </ModalFooter>
      </FilterContent>
    </ModalBackdrop>
  );
};

// ================== MAIN PAGE (WITH BATCH LOGIC) ==================

export function EmployeeDevicesPage() {
  const { user } = UserAuth();
  const logAction = useDeviceLogger(user);

  // Data State
  const [myDevices, setMyDevices] = useState([]);
  const [teamDevices, setTeamDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [nextHORequests, setNextHORequests] = useState([]);

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState(null);

  // Batch Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modals
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);

  // Filters & Logic
  const [filters, setFilters] = useState({ status: '', device_type: '', brand: '', operating_system: '' });
  const [uniqueValues, setUniqueValues] = useState({ types: [], brands: [], os: [] });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // References
  const isTeamLead = Number(user?.role_id) === 5;
  const [teamId, setTeamId] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // --- FETCHERS ---
  const fetchMyDevices = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('devices').select('*').eq('assigned_user_id', user.id).order('name', { ascending: true });
    if (mountedRef.current) setMyDevices(data || []);
  }, [user?.id]);

  const fetchUserTeamAndDevices = useCallback(async () => {
    if (!user?.id) return;
    setErrorState(null);
    try {
      let currentTeamId = teamId;
      if (!currentTeamId) {
        const { data: userData } = await supabase.from('users').select('team_id').eq('id', user.id).single();
        if (userData?.team_id) {
          currentTeamId = userData.team_id;
          if (mountedRef.current) setTeamId(currentTeamId);
        }
      }
      const { data: devicesData, error } = await supabase
        .from('devices')
        .select(`*, users:assigned_user_id (id, display_name, photo_url), locations (location_name)`)
        .eq('team_id', currentTeamId)
        .order('name');

      if (error) throw error;
      if (mountedRef.current) {
        const devs = devicesData || [];
        setTeamDevices(devs);
        setUniqueValues({
            types: [...new Set(devs.map((d) => d.device_type).filter(Boolean))],
            brands: [...new Set(devs.map((d) => d.brand).filter(Boolean))],
            os: [...new Set(devs.map((d) => d.operating_system).filter(Boolean))]
        });
      }
    } catch (err) {
      console.error(err);
      if (mountedRef.current) setErrorState('Unable to load team devices.');
    }
  }, [user?.id, teamId]);

  const fetchNextHORange = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('home_office_requests').select('id, date').eq('user_id', user.id).eq('status', 'approved').gte('date', today).order('date').limit(5);
    if (mountedRef.current) setNextHORequests(data || []);
  }, [user?.id]);

  const fetchDeviceLogs = useCallback(async (deviceId) => {
    if (!deviceId) return;
    if (mountedRef.current) setLoadingLogs(true);
    const { data } = await supabase.from('device_logs').select(`*, users(display_name)`).eq('device_id', deviceId).order('created_at', { ascending: false }).limit(50);
    if (mountedRef.current) {
      setDeviceLogs(data || []);
      setLoadingLogs(false);
    }
  }, []);

  const refreshAll = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (mountedRef.current) {
      if (silent) setRefreshing(true); else setLoading(true);
    }
    await Promise.allSettled([fetchMyDevices(), fetchUserTeamAndDevices(), fetchNextHORange()]);
    setSelectedIds(new Set()); 
    if (selectedDevice?.id) fetchDeviceLogs(selectedDevice.id);
    if (mountedRef.current) {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [user?.id, fetchMyDevices, fetchUserTeamAndDevices, fetchNextHORange, fetchDeviceLogs, selectedDevice]);

  useEffect(() => { refreshAll({ silent: false }); }, [refreshAll]);
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) refreshAll({ silent: true }); }, 60000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // --- SORT & FILTER ---
  const handleSort = (key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };
  const getSortIcon = (columnKey) => (sortConfig.key !== columnKey ? <FaSort style={{ opacity: 0.3 }} /> : sortConfig.direction === 'asc' ? <FaSortUp style={{ color: '#3b5bdb' }} /> : <FaSortDown style={{ color: '#3b5bdb' }} />);

  const filteredTeamDevices = useMemo(() => {
    const term = normalizeString(searchTerm);
    return teamDevices.filter((dev) => {
      const name = normalizeString(dev?.name || dev?.model || '');
      const tag = normalizeString(dev?.asset_tag || '');
      const userName = normalizeString(dev?.users?.display_name || '');
      return (!term || name.includes(term) || tag.includes(term) || userName.includes(term)) &&
             (!filters.status || cleanStatusString(dev.status) === cleanStatusString(filters.status)) &&
             (!filters.device_type || dev.device_type === filters.device_type);
    });
  }, [teamDevices, searchTerm, filters]);

  const sortedDevices = useMemo(() => {
    const items = [...filteredTeamDevices];
    if (!sortConfig.key) return items;
    const getVal = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
    items.sort((a, b) => {
      const valA = normalizeString(getVal(a, sortConfig.key) ?? '');
      const valB = normalizeString(getVal(b, sortConfig.key) ?? '');
      return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
    return items;
  }, [filteredTeamDevices, sortConfig]);

  // ================== ACTIONS (Take / Assign) ==================

  const handleAssignDevice = async (device, e) => {
    e?.stopPropagation();
    if (!isTeamLead) return;

    const { data: members } = await supabase.from('users').select('id, display_name').eq('team_id', teamId);
    if (!members?.length) return Toast.fire({ icon: 'error', title: 'No team members found' });

    const sortedMembers = [...members].sort((a, b) => {
      if (a.id === user.id) return -1;
      if (b.id === user.id) return 1;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

    const inputOptions = {};
    sortedMembers.forEach((m) => {
      inputOptions[m.id] = m.id === user.id ? `${m.display_name} (Me)` : m.display_name;
    });

    const { value: targetUserId } = await Swal.fire({
      title: 'Assign Device',
      text: `Assign ${device.name} to:`,
      input: 'select',
      inputOptions,
      showCancelButton: true,
      confirmButtonText: 'Assign',
      confirmButtonColor: '#3b5bdb',
    });

    if (!targetUserId) return;
    const targetName = inputOptions[targetUserId] || 'Unknown User';

    // 🟢 CORRECCIÓN: Siempre 'assigned' y Location '1' (Office), sin Slack automático.
    const initialStatus = 'assigned';
    const initialLoc = 1;

    try {
      await supabase.from('devices').update({
        assigned_user_id: targetUserId,
        status: initialStatus,
        location_id: initialLoc,
        fixed_assignment: true,
        assigned_by_user_id: user.id,
      }).eq('id', device.id);

      logAction(device.id, 'TL Assigned', `Assigned to ${targetName}`);
      
      // 🚀 NOTIFICACIÓN DE SLACK ELIMINADA AQUÍ (Solo en Next HO)

      Toast.fire({ icon: 'success', title: 'Assigned (Office)' });
      refreshAll({ silent: true });
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const handleAction = async (device, actionType) => {
    if (actionType === 'return') {
      handleOpenReturnModal();
      return;
    }

    if (actionType === 'take') {
      const { isConfirmed } = await Swal.fire({
        title: 'Take Device?',
        text: `Assign ${device.name}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Take',
        confirmButtonColor: '#28a745',
      });

      if (!isConfirmed) return;

      try {
        const { error } = await supabase.rpc('self_take_device', { p_device_id: device.id });
        if (error) throw error;

        logAction(device.id, 'Taken', 'Self taken', 'Office');

        // 🚀 NOTIFICACIÓN DE SLACK ELIMINADA AQUÍ (Solo en Next HO)

        Toast.fire({ icon: 'success', title: 'Assigned (Office)' });
        refreshAll({ silent: true });
      } catch (e) {
        Swal.fire('Error', e.message, 'error');
      }
    }
  };

  // ================== BATCH SELECTION LOGIC ==================

  const isSelectable = (dev) => cleanStatusString(dev.status) === 'available' && !dev.assigned_user_id;

  const handleSelectAll = () => {
    if (selectedIds.size === sortedDevices.filter(isSelectable).length) {
      setSelectedIds(new Set()); 
    } else {
      const newSet = new Set();
      sortedDevices.forEach(dev => { if (isSelectable(dev)) newSet.add(dev.id); });
      setSelectedIds(newSet);
    }
  };

  const toggleSelection = (id, dev) => {
    if (!isSelectable(dev)) return; 
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // ================== BATCH ASSIGNMENT ACTION ==================
  
  const handleBatchAssign = async (isSelfAssign) => {
    const devicesToAssign = teamDevices.filter(d => selectedIds.has(d.id));
    if (devicesToAssign.length === 0) return;

    let targetUserId = user.id;
    let targetName = "Me";

    if (!isSelfAssign && isTeamLead) {
        const { data: members } = await supabase.from('users').select('id, display_name').eq('team_id', teamId);
        if (!members?.length) return Toast.fire({ icon: 'error', title: 'No team members found' });
        const sortedMembers = [...members].sort((a, b) => a.display_name.localeCompare(b.display_name));
        const inputOptions = {};
        sortedMembers.forEach((m) => { inputOptions[m.id] = m.display_name; });

        const { value } = await Swal.fire({
            title: `Assign ${devicesToAssign.length} Devices`,
            text: 'Select the team member:',
            input: 'select',
            inputOptions,
            showCancelButton: true,
            confirmButtonText: `Assign`,
            confirmButtonColor: '#3b5bdb',
        });
        if (!value) return;
        targetUserId = value;
        targetName = inputOptions[value];
    } else if (!isSelfAssign && !isTeamLead) return;

    const result = await Swal.fire({
        title: 'Confirm Assignment',
        html: `Assign <b>${devicesToAssign.length}</b> devices to <b>${targetName}</b>?<br/><span style="font-size:0.85em; color:#666">Status will be 'Assigned' (Office). Use 'Next HO' to take home.</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b5bdb',
        confirmButtonText: 'Yes, Assign All'
    });
    if (!result.isConfirmed) return;

    setIsProcessingBatch(true);
    Swal.showLoading();

    try {
        // 🟢 CORRECCIÓN: Siempre 'assigned' y Location '1' (Office) en Batch también.
        const initialStatus = 'assigned';
        const initialLoc = 1;
        const deviceIds = devicesToAssign.map(d => d.id);

        const { error } = await supabase.from('devices').update({
            assigned_user_id: targetUserId,
            status: initialStatus,
            location_id: initialLoc,
            fixed_assignment: !isSelfAssign,
            assigned_by_user_id: user.id
        }).in('id', deviceIds);

        if (error) throw error;

        devicesToAssign.forEach(d => {
            logAction(d.id, isSelfAssign ? 'Taken (Batch)' : 'TL Assigned (Batch)', `Assigned to ${targetName}`);
        });

        // 🚀 NOTIFICACIÓN DE SLACK ELIMINADA AQUÍ (Solo en Next HO)

        Toast.fire({ icon: 'success', title: 'Batch assignment successful (Office)' });
        setSelectedIds(new Set());
        await refreshAll({ silent: true });
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Failed to assign devices.', 'error');
    } finally {
        setIsProcessingBatch(false);
        Swal.close();
    }
  };

  // ================== RETURN LOGIC ==================
  const returnableDevices = useMemo(() => myDevices.filter((d) => !isPendingStatus(d.status)), [myDevices]);
  
  const handleOpenReturnModal = () => {
    if (returnableDevices.length === 0) return Toast.fire({ icon: 'info', title: 'No devices available to return' });
    setIsReturnModalOpen(true);
  };

  const ensureUpdatedOrThrow = (updatedRows, expectedCount, context) => {
    const got = Array.isArray(updatedRows) ? updatedRows.length : 0;
    if (got === 0) throw new Error(`${context}: 0 rows updated (permissions or state changed).`);
  };

  const handleSmartBatchReturn = async (selectedIdsForUnassign) => {
    if (!user?.id) return;
    const candidates = returnableDevices;
    if (candidates.length === 0) { setIsReturnModalOpen(false); return; }

    const selectedSet = new Set(selectedIdsForUnassign || []);
    const requestedUnassign = candidates.filter((d) => selectedSet.has(d.id));
    const blockedUnassign = requestedUnassign.filter((d) => isHomeOfficeDevice(d) || isTLAssigned(d, user.id));
    const canUnassign = requestedUnassign.filter((d) => !blockedUnassign.some((b) => b.id === d.id));
    const toAvailable = canUnassign.filter((d) => !isHomeOfficeDevice(d) && !isTLAssigned(d, user.id));
    const toAvailableSet = new Set(toAvailable.map((d) => d.id));
    const toPendingKeepAssigned = candidates.filter((d) => !toAvailableSet.has(d.id));

    const result = await Swal.fire({
      title: 'Confirm Return',
      html: `<div style="text-align:left; font-size: 0.9rem;">
        <p>Returning <b>${candidates.length}</b> devices.</p>
        ${toPendingKeepAssigned.length > 0 ? `<div style="background:#fff9db; padding:5px; border-radius:4px;">🟠 <b>${toPendingKeepAssigned.length}</b> -> pending_review</div>` : ''}
        ${toAvailable.length > 0 ? `<div style="background:#ffe3e3; padding:5px; border-radius:4px; margin-top:5px;">🔴 <b>${toAvailable.length}</b> -> available (unassigned)</div>` : ''}
      </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#fa5252',
      confirmButtonText: 'Confirm & Process'
    });

    if (!result.isConfirmed) return;
    setIsProcessingBatch(true);
    Swal.showLoading();

    try {
      const promises = [];
      if (toPendingKeepAssigned.length > 0) {
        const ids = toPendingKeepAssigned.map((d) => d.id);
        promises.push(supabase.from('devices').update({ status: 'pending_review', location_id: 1,assigned_user_id: null, fixed_assignment: false, assigned_by_user_id: null  }).in('id', ids).eq('assigned_user_id', user.id).select().then(({data, error}) => {
             if(error) throw error; ensureUpdatedOrThrow(data, ids.length, 'pending');
             toPendingKeepAssigned.forEach(d => logAction(d.id, 'Return Requested', 'To Pending Review', 'Office'));
        }));
      }
      if (toAvailable.length > 0) {
        const ids = toAvailable.map((d) => d.id);
        promises.push(supabase.from('devices').update({ status: 'available', location_id: 1, assigned_user_id: null, fixed_assignment: false, assigned_by_user_id: null }).in('id', ids).eq('assigned_user_id', user.id).select().then(({data, error}) => {
             if(error) throw error; ensureUpdatedOrThrow(data, ids.length, 'unassign');
             toAvailable.forEach(d => logAction(d.id, 'Unassigned', 'Returned to Available', 'Office'));
        }));
      }
      await Promise.all(promises);
      setIsReturnModalOpen(false);
      Toast.fire({ icon: 'success', title: 'Return processed' });
      await refreshAll({ silent: true });
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Could not process return.', 'error');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleTakeToHomeOffice = async () => {
    if (!nextHORequests.length) return;
    const candidates = myDevices.filter((d) => cleanStatusString(d.status) !== 'taken_ho' && !isPendingStatus(d.status));
    if (!candidates.length) return Toast.fire({ icon: 'info', title: 'No eligible devices for Home Office' });

    const { isConfirmed } = await Swal.fire({ title: 'Home Office', text: `Take ${candidates.length} devices to HO? This will trigger Slack notification.`, showCancelButton: true, confirmButtonText: 'Yes, Take to HO' });
    if (!isConfirmed) return;

    const ids = candidates.map(d => d.id);
    await supabase.from('devices').update({ status: 'taken_ho', location_id: 2 }).in('id', ids);
    candidates.forEach((d) => logAction(d.id, 'Home Office', 'Taken to HO'));
    
    // 🚀 AQUÍ ES EL ÚNICO LUGAR DONDE SE ENVÍA EL SLACK
    await supabase.functions.invoke('device-taken-ho', {
        body: { userId: user.id, devices: candidates.map(d => ({ id: d.id, asset_tag: d.asset_tag, name: d.name || d.model, device_type: d.device_type })) }
    });

    refreshAll({ silent: true });
    Toast.fire({ icon: 'success', title: 'Devices updated to HO & Notified' });
  };

  return (
    <MainLayout>
      <Sidebar />
      <ContentWrapper>
        {/* LEFT: MY DEVICES */}
        <LeftPanel>
          <PanelTitle>My Assigned Devices</PanelTitle>
          <MyDeviceList>
            {myDevices.map((dev) => (
              <MyDeviceItem key={dev.id}>
                <MyDeviceIcon>{getDeviceIcon(dev.device_type)}</MyDeviceIcon>
                <MyDeviceInfo>
                  <span className="name">{dev.name || dev.model}</span>
                  <span className="tag">{dev.asset_tag}</span>
                  <div className="meta-row">
                    {dev.fixed_assignment && <span className="meta fixed">TL Assigned</span>}
                    {cleanStatusString(dev.status) === 'taken_ho' && <span className="meta ho">Home Office</span>}
                    {isPendingStatus(dev.status) && <span className="meta review">Pending</span>}
                  </div>
                </MyDeviceInfo>
                {!isPendingStatus(dev.status) && (
                    <SmallButton onClick={(e) => { e.stopPropagation(); handleOpenReturnModal(); }}>Return</SmallButton>
                )}
              </MyDeviceItem>
            ))}
            {myDevices.length === 0 && <EmptyText>No devices assigned.</EmptyText>}
          </MyDeviceList>
          <div style={{ marginTop: 'auto' }}>
            <Button onClick={handleOpenReturnModal} disabled={returnableDevices.length === 0} style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <FaUndo /> Return / Unassign
            </Button>
          </div>
        </LeftPanel>

        {/* CENTER: TEAM TABLE */}
        <CenterPanel>
          <PanelHeader>
            <h1>Team Devices</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
              {isTeamLead && (
                <Button onClick={() => setIsAddDeviceOpen(true)} style={{ background: '#3b5bdb', color: 'white', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <FaPlus /> Add Device
                </Button>
              )}
              <ReserveButton onClick={handleTakeToHomeOffice} disabled={nextHORequests.length === 0}>
                <FaCalendarPlus /> Next HO
              </ReserveButton>
            </div>
          </PanelHeader>

          {/* 🔥 BATCH ACTION BAR */}
          {selectedIds.size > 0 && (
            <BatchActionBar>
                <div className="batch-info">
                    <span className="count">{selectedIds.size}</span> devices selected
                </div>
                <div className="batch-actions">
                    <Button onClick={() => setSelectedIds(new Set())} style={{ background: '#fff', border: '1px solid #ccc' }}>Cancel</Button>
                    <Button $type="success" style={{ background: '#2b8a3e', color: 'white' }} onClick={() => handleBatchAssign(true)}>Take Selected</Button>
                    {isTeamLead && <Button primary onClick={() => handleBatchAssign(false)}>Assign to User</Button>}
                </div>
            </BatchActionBar>
          )}

          <HeaderActions>
            <SearchBar>
              <FaSearch />
              <input type="text" placeholder="Search devices..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </SearchBar>
            <IconButton onClick={() => setIsFilterOpen(true)} $active={Object.values(filters).some(Boolean)}><FaFilter /></IconButton>
            <IconButton onClick={() => refreshAll({ silent: true })} $active={refreshing} disabled={refreshing}><FaSync className={refreshing ? 'spin' : ''} /></IconButton>
          </HeaderActions>

          <DeviceTableContainer>
            <GridHeader style={{ gridTemplateColumns: '40px 0.6fr 1.5fr 1fr 1.5fr 0.8fr' }}>
                <Gh $center>
                    <Checkbox type="checkbox" onChange={handleSelectAll} checked={sortedDevices.length > 0 && selectedIds.size === sortedDevices.filter(isSelectable).length} />
                </Gh>
                <Gh onClick={() => handleSort('asset_tag')}>Tag {getSortIcon('asset_tag')}</Gh>
                <Gh onClick={() => handleSort('name')}>Device {getSortIcon('name')}</Gh>
                <Gh $center onClick={() => handleSort('locations.location_name')}>Loc {getSortIcon('locations.location_name')}</Gh>
                <Gh onClick={() => handleSort('users.display_name')}>User {getSortIcon('users.display_name')}</Gh>
                <Gh $center>Status</Gh>
            </GridHeader>

            <ScrollableTable>
              {loading && <div style={{ padding: '20px' }}>Loading...</div>}
              {!loading && sortedDevices.map((dev) => {
                  const selectable = isSelectable(dev);
                  return (
                    <GridRow 
                        key={dev.id} 
                        $active={selectedDevice?.id === dev.id} 
                        $selected={selectedIds.has(dev.id)}
                        onClick={() => { setSelectedDevice(dev); fetchDeviceLogs(dev.id); }}
                        style={{ gridTemplateColumns: '40px 0.6fr 1.5fr 1fr 1.5fr 0.8fr' }}
                    >
                        <Gd $center onClick={(e) => e.stopPropagation()}>
                            <Checkbox type="checkbox" disabled={!selectable} checked={selectedIds.has(dev.id)} onChange={() => toggleSelection(dev.id, dev)} />
                        </Gd>
                        <Gd title={dev.asset_tag}>{dev.asset_tag || '-'}</Gd>
                        <Gd>{dev.name || dev.model || 'Unknown'}</Gd>
                        <Gd $center>{dev.locations?.location_name || 'Office'}</Gd>
                        <Gd>
                            {dev.assigned_user_id ? (
                                <AssignedUser><UserDot /> <span>{formatCompactName(dev.users?.display_name)}</span></AssignedUser>
                            ) : (
                                <UnassignedUser><StatusDot color="#28a745" /> Unassigned</UnassignedUser>
                            )}
                        </Gd>
                        <Gd $center>
                             {cleanStatusString(dev.status) === 'available' ? <Badge $color="#d3f9d8" $textColor="#2b8a3e">Available</Badge> : 
                              isPendingStatus(dev.status) ? <Badge $color="#ffe3e3" $textColor="#c92a2a">Pending</Badge> : 
                              <Badge $color="#f1f3f5" $textColor="#adb5bd">Assigned</Badge>}
                        </Gd>
                    </GridRow>
                  );
              })}
            </ScrollableTable>
          </DeviceTableContainer>
        </CenterPanel>

        <RightPanel>
             {selectedDevice ? (
                 <>
                    <DetailHeader>
                        <LargeDeviceIcon>{getDeviceIcon(selectedDevice.device_type)}</LargeDeviceIcon>
                        <h2>{selectedDevice.name}</h2>
                        <p>{selectedDevice.brand} • {selectedDevice.asset_tag}</p>
                        <div className="status-badge">
                            {selectedDevice.assigned_user_id ? <span style={{ color: '#f7b928', fontWeight: 'bold' }}>Taken by {formatCompactName(selectedDevice.users?.display_name)}</span> : <span style={{ color: '#28a745', fontWeight: 'bold' }}>Available</span>}
                        </div>
                    </DetailHeader>
                    <LogSection>
                        <h4>Activity Log</h4>
                        <LogList>
                            {deviceLogs.map(log => (
                                <LogItem key={log.id}>
                                    <div className="time-col"><span className="time">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span><span className="date">{new Date(log.created_at).toLocaleDateString()}</span></div>
                                    <div className="info-col"><strong>{log.users?.display_name || 'System'}</strong><span>{log.action} ({log.location})</span></div>
                                </LogItem>
                            ))}
                            {deviceLogs.length === 0 && <EmptyText>No activity.</EmptyText>}
                        </LogList>
                    </LogSection>
                 </>
             ) : (
                 <EmptyState><FaDesktop size={48} color="#e9ecef" /><p>Select a device</p></EmptyState>
             )}
        </RightPanel>
        
        <AddDeviceModal isOpen={isAddDeviceOpen} onClose={() => setIsAddDeviceOpen(false)} teamId={teamId} onDeviceAdded={() => refreshAll({ silent: true })} />
        <FilterModal isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} onApply={setFilters} currentFilters={filters} uniqueValues={uniqueValues} />
        <ReturnSelectionModal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} devices={returnableDevices} currentUserId={user?.id} onConfirm={handleSmartBatchReturn} isProcessing={isProcessingBatch} />
      </ContentWrapper>
    </MainLayout>
  );
}

// ================== STYLES ==================

const spinAnimation = keyframes` 100% { transform: rotate(360deg); } `;
const fadeIn = keyframes` from { opacity: 0; } to { opacity: 1; } `;
const fadeOut = keyframes` from { opacity: 1; } to { opacity: 0; } `;
const slideIn = keyframes` from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } `;
const slideOut = keyframes` from { transform: translateY(0); opacity: 1; } to { transform: translateY(20px); opacity: 0; } `;
const skeletonAnim = keyframes` 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } `;

const MainLayout = styled.div` display: grid; grid-template-columns: 80px 1fr; background: #f0f2f5; height: 100vh; width: 100vw; overflow: hidden; @media (max-width: 768px) { grid-template-columns: 1fr; height: auto; overflow-y: auto; } `;
const ContentWrapper = styled.div` display: grid; grid-template-columns: 20% 55% 22%; gap: 20px; padding: 20px; height: 100vh; @media (max-width: 1024px) { grid-template-columns: 1fr; grid-template-rows: auto auto auto; height: auto; overflow-y: visible; } `;
const PanelBase = styled.div` background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); display: flex; flex-direction: column; overflow: hidden; `;
const LeftPanel = styled(PanelBase)` padding: 20px; max-height: 95vh; @media (max-width: 1024px) { max-height: 500px; } `;
const CenterPanel = styled.div` display: flex; flex-direction: column; gap: 15px; height: 100%; max-height: 95vh; overflow: hidden; @media (max-width: 1024px) { max-height: none; height: auto; overflow: visible; } `;
const RightPanel = styled(PanelBase)` padding: 25px; max-height: 95vh; animation: ${fadeIn} 0.3s; @media (max-width: 1024px) { max-height: none; height: auto; } `;
const PanelTitle = styled.h3` font-size: 1.1rem; font-weight: 700; color: #333; margin-bottom: 15px; `;
const PanelHeader = styled.div` display: flex; align-items: center; justify-content: space-between; h1 { font-size: 1.8rem; font-weight: 700; margin: 0; } `;
const MyDeviceList = styled.div` flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; `;
const MyDeviceItem = styled.div` display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #f0f0f0; border-radius: 8px; &:hover { border-color: #ddd; } `;
const MyDeviceIcon = styled.div` font-size: 1.4rem; color: #555; `;
const MyDeviceInfo = styled.div` flex: 1; display: flex; flex-direction: column; .name { font-weight: 600; font-size: 0.9rem; } .tag { font-size: 0.75rem; color: #888; } .meta-row { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; } .meta { font-size: 0.65rem; font-weight: bold; padding: 2px 5px; border-radius: 4px; text-transform: uppercase; } .fixed { background: #e0e7ff; color: #3b5bdb; } .ho { background: #fff3bf; color: #f08c00; } .review { background: #ffe3e3; color: #c92a2a; } `;
const Button = styled.button` padding: 8px 16px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; background: ${(p) => (p.primary ? '#3b5bdb' : p.$danger ? '#fa5252' : '#eee')}; color: ${(p) => (p.primary || p.$danger ? 'white' : '#333')}; transition: 0.2s; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: not-allowed; } `;
const SmallButton = styled.button` padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; border: none; background: #ffe3e3; color: #c92a2a; font-weight: 600; cursor: pointer; &:hover { background: #ffc9c9; } &:disabled { opacity: 0.5; } `;
const ReserveButton = styled(Button)` display: flex; align-items: center; gap: 8px; font-size: 0.9rem; `;
const ActionButton = styled.button` padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: 0.2s; ${p => p.$type === 'primary' && css` background: #e7f5ff; color: #1c7ed6; &:hover { background: #d0ebff; } `} ${p => p.$type === 'success' && css` background: #ebfbee; color: #2b8a3e; &:hover { background: #d3f9d8; } `} ${p => p.$type === 'danger' && css` background: #fff5f5; color: #fa5252; &:hover { background: #ffe3e3; } `} `;
const ModalBackdrop = styled.div` position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center; animation: ${p => p.$closing ? fadeOut : fadeIn} 0.2s forwards; padding: 20px; `;
const FilterContent = styled.div` background: white; width: 100%; max-width: 480px; border-radius: 16px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); animation: ${p => p.$closing ? slideOut : slideIn} 0.3s forwards; display: flex; flex-direction: column; overflow: hidden; `;
const ModalHeader = styled.div` display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-shrink: 0; h3 { margin: 0; font-size: 1.25rem; color: #111827; } `;
const CloseBtn = styled.button` background: #f3f4f6; border: none; height: 32px;  border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; color: #6b7280; transition: all 0.2s; &:hover { background: #e5e7eb; color: #111827; } `;
const InfoBox = styled.div` display: flex; gap: 12px; background: #eff6ff; color: #1e40af; padding: 16px; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; margin-bottom: 16px; flex-shrink: 0; border: 1px solid #dbeafe; `;
const ActionBar = styled.div` display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-shrink: 0; .count { font-weight: 600; color: #374151; font-size: 0.9rem; } `;
const SelectionList = styled.div` overflow-y: auto; display: flex; flex-direction: column; gap: 10px; flex: 1; padding: 4px; padding-right: 8px; min-height: 150px; &::-webkit-scrollbar { width: 6px; } &::-webkit-scrollbar-track { background: transparent; } &::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; } `;
const SelectionItem = styled.div` display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; cursor: pointer; transition: all 0.2s ease; user-select: none; background: ${p => p.$selected ? '#fff1f2' : 'white'}; border: 1px solid ${p => p.$selected ? '#f43f5e' : '#e5e7eb'}; box-shadow: ${p => p.$selected ? '0 2px 5px rgba(244, 63, 94, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)'}; opacity: ${p => p.$disabled ? 0.6 : 1}; &:hover { background: ${p => p.$selected ? '#ffe4e6' : '#f9fafb'}; border-color: ${p => p.$selected ? '#f43f5e' : '#d1d5db'}; } .checkbox-icon { display: flex; align-items: center; justify-content: center; width: 24px; } .info { flex: 1; display: flex; flex-direction: column; .name { font-weight: 600; font-size: 0.95rem; color: #1f2937; } .meta { font-size: 0.8rem; color: #6b7280; } } .status-indicator { display: flex; justify-content: flex-end; } `;
const ModalFooter = styled.div` display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f3f4f6; flex-shrink: 0; `;
const EmptyList = styled.div` text-align: center; color: #999; padding: 40px 20px; font-style: italic; background: #f9fafb; border-radius: 8px; border: 1px dashed #e5e7eb; `;
const FilterBody = styled.div` display: flex; flex-direction: column; gap: 15px; `;
const FilterGroup = styled.div` display: flex; flex-direction: column; gap: 6px; label { font-size: 0.85rem; font-weight: 600; } select { padding: 10px; border-radius: 6px; border: 1px solid #ddd; } `;
const EmptyState = styled.div` display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ccc; gap: 10px; p { font-size: 1.1rem; } `;
const EmptyText = styled.p` text-align: center; color: #adb5bd; margin-top: 20px; font-style: italic; `;
const HeaderActions = styled.div` display: flex; gap: 10px; `;
const SearchBar = styled.div` flex: 1; display: flex; align-items: center; background: white; padding: 0 15px; border-radius: 8px; border: 1px solid #e0e0e0; height: 45px; gap: 10px; color: #888; &:focus-within { border-color: #3b5bdb; box-shadow: 0 0 0 2px rgba(59,91,219,0.1); } input { border: none; outline: none; flex: 1; font-size: 0.95rem; } `;
const IconButton = styled.button` height: 45px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid ${p => p.$active ? '#3b5bdb' : '#e0e0e0'}; background: ${p => p.$active ? '#edf2ff' : 'white'}; color: ${p => p.$active ? '#3b5bdb' : '#666'}; font-size: 1.1rem; cursor: pointer; transition: 0.2s; &:hover:not(:disabled) { border-color: #3b5bdb; color: #3b5bdb; } &:disabled { opacity: 0.6; cursor: wait; } .spin { animation: ${spinAnimation} 1s linear infinite; } `;
const DeviceTableContainer = styled(PanelBase)` flex: 1; `;
const GridHeader = styled.div` display: grid; grid-template-columns: 0.6fr 1.5fr 1fr 1.5fr 0.8fr; background: #f8f9fa; border-bottom: 1px solid #eee; padding: 12px 20px; font-weight: 600; font-size: 0.85rem; color: #666; position: sticky; top: 0; z-index: 2; min-width: 600px; `;
const Gh = styled.div` cursor: pointer; display: flex; align-items: center; gap: 6px; ${p => p.$center && 'justify-content: center;'} &:hover { color: #3b5bdb; } `;
const ScrollableTable = styled.div` flex: 1; overflow-y: auto; overflow-x: auto; position: relative; `;
const Gd = styled.div` font-size: 0.9rem; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${p => p.$center && 'display: flex; justify-content: center;'} `;
const AssignedUser = styled.div` display: flex; align-items: center; gap: 8px; font-weight: 500; color: #495057; `;
const UnassignedUser = styled.div` display: flex; align-items: center; gap: 8px; color: #40c057; font-size: 0.9em; `;
const UserDot = styled.div` width: 8px; height: 8px; border-radius: 50%; background: #fab005; `;
const StatusDot = styled.div` width: 8px; height: 8px; border-radius: 50%; background: ${p => p.color}; `;
const Badge = styled.div` padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; background: ${p => p.$color}; color: ${p => p.$textColor || 'white'}; display: inline-block; `;
const DetailHeader = styled.div` text-align: center; margin-bottom: 25px; h2 { margin: 10px 0 5px; font-size: 1.4rem; color: #333; } p { color: #888; font-size: 0.9rem; } .status-badge { margin-top: 10px; padding: 8px; background: #f8f9fa; border-radius: 8px; display: inline-block; } `;
const LargeDeviceIcon = styled.div` font-size: 4rem; color: #444; margin-bottom: 10px; `;
const LogSection = styled.div` flex: 1; display: flex; flex-direction: column; overflow: hidden; h4 { font-size: 0.95rem; margin-bottom: 15px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 10px; } `;
const LogList = styled.div` flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 5px; `;
const LogItem = styled.div` display: flex; gap: 15px; font-size: 0.85rem; .time-col { min-width: 60px; color: #888; display: flex; flex-direction: column; } .time { font-weight: 600; color: #555; } .date { font-size: 0.75rem; } .info-col { display: flex; flex-direction: column; } strong { color: #333; } `;

// NEW BATCH STYLES
const BatchActionBar = styled.div` background: #e7f5ff; border: 1px solid #74c0fc; border-radius: 8px; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; animation: ${slideIn} 0.3s forwards; .batch-info { font-weight: 600; color: #1c7ed6; display: flex; align-items: center; gap: 8px; .count { background: #1c7ed6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem; } } .batch-actions { display: flex; gap: 10px; } `;
const Checkbox = styled.input` width: 18px; height: 18px; cursor: pointer; accent-color: #3b5bdb; &:disabled { cursor: not-allowed; opacity: 0.4; } `;
const GridRow = styled.div` display: grid; padding: 14px 20px; border-bottom: 1px solid #f1f3f5; align-items: center; cursor: pointer; transition: 0.1s; background: ${p => p.$selected ? '#e7f5ff' : p.$active ? '#f8f9fa' : 'white'}; border-left: ${p => p.$selected ? '4px solid #3b5bdb' : '4px solid transparent'}; &:hover { background: ${p => p.$selected ? '#d0ebff' : '#f8f9fa'}; } min-width: 600px; animation: ${fadeIn} 0.3s; `;