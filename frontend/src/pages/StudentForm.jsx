import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '../api';
import { useFlash } from '../components/FlashProvider';
import { SkeletonCard } from '../components/Skeleton';

function createFieldSchema(col) {
  let schema;
  switch (col.inferredType) {
    case 'int':
    case 'bigint':
      schema = z.coerce.number().int('Must be an integer');
      break;
    case 'decimal':
      schema = z.coerce.number();
      break;
    case 'boolean':
      schema = z.union([z.string(), z.number(), z.boolean()]);
      break;
    case 'date':
      schema = z.string().refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid date');
      break;
    case 'text':
      schema = z.string().max(1000, 'Too long');
      break;
    default:
      schema = z.string();
  }
  if (!col.nullable) {
    schema = schema.min(1, `"${col.displayLabel}" is required`);
  } else {
    schema = schema.optional().or(z.literal(''));
  }
  return schema;
}

export default function StudentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { addFlash } = useFlash();
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [initialValues, setInitialValues] = useState({});
  const [fieldSchemas, setFieldSchemas] = useState({});

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        let data;
        if (isEdit) {
          data = await api.get(`/students/${id}`);
          setColumns(data.columns);
          setInitialValues(data.student);
        } else {
          data = await api.get('/students?size=1');
          setColumns(data.columns);
        }

        // Build field schemas
        const schemas = {};
        data.columns.forEach((col) => {
          if (col.name !== 'id' && col.name !== 'created_at' && col.name !== 'updated_at') {
            schemas[col.name] = createFieldSchema(col);
          }
        });
        setFieldSchemas(schemas);

        // Set default values for create
        if (!isEdit) {
          const defaults = {};
          data.columns.forEach((col) => {
            if (col.name !== 'id' && col.name !== 'created_at' && col.name !== 'updated_at') {
              defaults[col.name] = '';
            }
          });
          // Trigger form reset with defaults
          if (mounted) {
            // Form will use defaultValues
          }
        }
      } catch (err) {
        if (mounted) addFlash(err.message, 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => { mounted = false; };
  }, [id, isEdit, addFlash]);

  // Create dynamic schema
  const formSchema = useMemo(() => z.object(fieldSchemas), [fieldSchemas]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  // Reset form when initialValues change (for edit mode)
  useEffect(() => {
    if (Object.keys(initialValues).length > 0) {
      reset(initialValues);
    }
  }, [initialValues, reset]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (isEdit) {
        await api.post(`/students/${id}`, data);
        addFlash('Student updated successfully!', 'success');
      } else {
        await api.post('/students', data);
        addFlash('Student created successfully!', 'success');
      }
      navigate('/students');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        // Set server-side validation errors
        err.errors.forEach((e, idx) => {
          // This is a simplified error handling
        });
      }
      addFlash(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <SkeletonCard className="p-6" />
      </div>
    );
  }

  const displayColumns = columns.filter(
    (c) => c.name !== 'id' && c.name !== 'created_at' && c.name !== 'updated_at'
  );

  const renderField = (col) => {
    const error = errors[col.name];
    const required = !col.nullable;
    const fieldProps = register(col.name);

    if (col.inferredType === 'boolean') {
      return (
        <div className="grid gap-2">
          <label className="label">{col.displayLabel} {required && <span className="text-danger-500">*</span>}</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="1"
                {...fieldProps}
                className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm text-primary-700 dark:text-gray-300">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="0"
                {...fieldProps}
                className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm text-primary-700 dark:text-gray-300">No</span>
            </label>
          </div>
          {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
        </div>
      );
    }

    if (col.inferredType === 'category' && col.stats?.distinctCount <= 12 && col.stats?.distinctCount > 1) {
      const uniqueVals = [...new Set(col.stats.sampleValues || [])];
      return (
        <div className="grid gap-2">
          <label htmlFor={col.name} className="label">
            {col.displayLabel} {required && <span className="text-danger-500">*</span>}
          </label>
          <select
            id={col.name}
            {...fieldProps}
            className="input cursor-pointer"
            disabled={col.name === 'student_id'}
          >
            {col.nullable && <option value="">-- Select --</option>}
            {uniqueVals.map((v) => (
              <option key={v} value={String(v)}>{String(v)}</option>
            ))}
          </select>
          {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
        </div>
      );
    }

    if (col.inferredType === 'date') {
      return (
        <div className="grid gap-2">
          <label htmlFor={col.name} className="label">
            {col.displayLabel} {required && <span className="text-danger-500">*</span>}
          </label>
          <input
            type="date"
            id={col.name}
            {...fieldProps}
            className="input"
            min="1900-01-01"
            max="2100-12-31"
          />
          {error && <p className="text-sm text-danger-600" role="alert">{error.message}</p>}
          {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
        </div>
      );
    }

    if (col.inferredType === 'int' || col.inferredType === 'bigint' || col.inferredType === 'decimal') {
      return (
        <div className="grid gap-2">
          <label htmlFor={col.name} className="label">
            {col.displayLabel} {required && <span className="text-danger-500">*</span>}
          </label>
          <input
            type="number"
            id={col.name}
            {...fieldProps}
            step={col.inferredType === 'decimal' ? '0.01' : '1'}
            className="input"
            disabled={col.name === 'student_id'}
          />
          {error && <p className="text-sm text-danger-600" role="alert">{error.message}</p>}
          {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
        </div>
      );
    }

    if (col.inferredType === 'text') {
      return (
        <div className="grid gap-2">
          <label htmlFor={col.name} className="label">
            {col.displayLabel} {required && <span className="text-danger-500">*</span>}
          </label>
          <textarea
            id={col.name}
            {...fieldProps}
            rows={3}
            className="input"
          />
          {error && <p className="text-sm text-danger-600" role="alert">{error.message}</p>}
          {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
        </div>
      );
    }

    // Default: text input
    return (
      <div className="grid gap-2">
        <label htmlFor={col.name} className="label">
          {col.displayLabel} {required && <span className="text-danger-500">*</span>}
        </label>
        <input
          type="text"
          id={col.name}
          {...fieldProps}
          className="input"
        />
        {error && <p className="text-sm text-danger-600" role="alert">{error.message}</p>}
        {col.nullable && <p className="text-xs text-gray-500 mt-1">Optional</p>}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">
            {isEdit ? 'Edit Student' : 'Add New Student'}
          </h2>
          <Link to="/students" className="text-sm text-primary-400 dark:text-gray-500 hover:text-primary-700 dark:hover:text-gray-300 transition-colors">
            ← Back to list
          </Link>
        </div>

        {Object.keys(errors).length > 0 && (
          <div className="mb-6 p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg" role="alert">
            <ul className="list-disc list-inside text-sm space-y-1">
              {Object.entries(errors).map(([key, err]) => (
                <li key={key}>{err.message || String(err)}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {displayColumns.map((col) => (
            <div key={col.name}>{renderField(col)}</div>
          ))}

          <div className="flex justify-end gap-3 pt-4 border-t border-primary-100 dark:border-gray-800">
            <Link to="/students" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting || loading} className={isEdit ? 'btn-primary' : 'btn-success'}>
              {isSubmitting || loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Student')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}