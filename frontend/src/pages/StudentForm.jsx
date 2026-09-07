/**
 * Student Form Page - Dynamic create/edit form using new UI components
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '../api';
import { useLanguage } from '../hooks/useLanguage';
import {
  Card,
  Button,
  Input,
  Textarea,
  Select,
  RadioGroup,
  Badge,
  Flex,
  SkeletonCard,
} from '../components/ui';
import { useFlash } from '../components/ui/Toast';

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
    const requiredMessage = `"${col.displayLabel}" is required`;
    schema = col.inferredType === 'boolean'
      ? schema.refine((value) => value !== '', requiredMessage)
      : schema.min(1, requiredMessage);
  } else {
    schema = schema.optional().or(z.literal(''));
  }
  return schema;
}

const NON_EDITABLE_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function mapServerErrorsToFields(rawErrors, columns) {
  const supportedFields = new Map();
  columns.forEach((col) => {
    if (NON_EDITABLE_FIELDS.has(col.name)) return;
    supportedFields.set(col.name, col.name);
    if (typeof col.displayLabel === 'string') {
      supportedFields.set(col.displayLabel, col.name);
    }
  });

  const errors = Array.isArray(rawErrors)
    ? rawErrors
    : rawErrors && typeof rawErrors === 'object'
      ? Object.entries(rawErrors).map(([field, message]) => ({ field, message }))
      : [];
  const fieldErrors = new Map();

  errors.forEach((entry) => {
    let candidate;
    let message;

    if (typeof entry === 'string') {
      candidate = entry.match(/^"([^"]+)"/)?.[1];
      message = entry;
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      candidate = entry.field ?? entry.name;
      if (!candidate && Array.isArray(entry.path)) {
        candidate = entry.path[0];
      }
      message = Array.isArray(entry.message) ? entry.message[0] : entry.message ?? entry.error;
    }

    const field = typeof candidate === 'string' ? supportedFields.get(candidate) : undefined;
    if (field && typeof message === 'string' && message.trim()) {
      fieldErrors.set(field, message);
    }
  });

  return fieldErrors;
}

export default function StudentForm() {
  const { t } = useLanguage();
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
    control,
    register,
    handleSubmit,
    setError,
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
        addFlash(t('studentForm.updated'), 'success');
      } else {
        await api.post('/students', data);
        addFlash(t('studentForm.created'), 'success');
      }
      navigate('/students');
    } catch (err) {
      if (err instanceof ApiError) {
        const serverErrors = err.data?.fields ?? err.errors;
        mapServerErrorsToFields(serverErrors, columns).forEach((message, field) => {
          setError(field, { type: 'server', message });
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

  const getFieldConfig = (col) => {
    const error = errors[col.name];
    const required = !col.nullable;
    const isStudentId = col.name === 'student_id';

    if (col.inferredType === 'boolean') {
      return {
        type: 'radio',
        options: [
          { value: '1', label: t('common.yes') },
          { value: '0', label: t('common.no') },
        ],
        required,
        disabled: isStudentId,
      };
    }

    if (col.inferredType === 'category' && col.stats?.distinctCount <= 12 && col.stats?.distinctCount > 1) {
      const uniqueVals = [...new Set(col.stats.sampleValues || [])];
      return {
        type: 'select',
        options: uniqueVals.map((v) => ({ value: String(v), label: String(v) })),
        placeholder: t('common.select'),
        required,
        disabled: isStudentId,
      };
    }

    if (col.inferredType === 'date') {
      return {
        type: 'date',
        min: '1900-01-01',
        max: '2100-12-31',
        required,
      };
    }

    if (col.inferredType === 'int' || col.inferredType === 'bigint' || col.inferredType === 'decimal') {
      return {
        type: 'number',
        step: col.inferredType === 'decimal' ? '0.01' : '1',
        required,
        disabled: isStudentId,
      };
    }

    if (col.inferredType === 'text') {
      return {
        type: 'textarea',
        rows: 3,
        required,
      };
    }

    // Default: text input
    return {
      type: 'text',
      required,
    };
  };

  const renderField = (col) => {
    const config = getFieldConfig(col);
    const error = errors[col.name];
    const required = !col.nullable;

    if (config.type === 'radio') {
      return (
        <Controller
          name={col.name}
          control={control}
          render={({ field }) => (
            <RadioGroup
              name={field.name}
              label={col.displayLabel}
              error={error?.message}
              required={required}
              options={config.options}
              disabled={config.disabled}
              value={field.value == null ? '' : String(field.value)}
              onChange={field.onChange}
              inline
            />
          )}
        />
      );
    }

    const fieldProps = register(col.name);

    if (config.type === 'select') {
      return (
        <Select
          name={col.name}
          label={col.displayLabel}
          error={error?.message}
          required={required}
          options={config.options}
          placeholder={config.placeholder}
          disabled={config.disabled}
          {...fieldProps}
        />
      );
    }

    if (config.type === 'date') {
      return (
        <Input
          type="date"
          name={col.name}
          label={col.displayLabel}
          error={error?.message}
          required={required}
          min={config.min}
          max={config.max}
          {...fieldProps}
        />
      );
    }

    if (config.type === 'number') {
      return (
        <Input
          type="number"
          name={col.name}
          label={col.displayLabel}
          error={error?.message}
          required={required}
          step={config.step}
          disabled={config.disabled}
          {...fieldProps}
        />
      );
    }

    if (config.type === 'textarea') {
      return (
        <Textarea
          name={col.name}
          label={col.displayLabel}
          error={error?.message}
          required={required}
          rows={config.rows}
          {...fieldProps}
        />
      );
    }

    // Default text input
    return (
      <Input
        name={col.name}
        label={col.displayLabel}
        error={error?.message}
        required={required}
        {...fieldProps}
      />
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card padding="lg">
        <Flex direction="col" gap={4} className="sm:flex-row sm:items-center sm:justify-between mb-8">
          <h2 className="text-xl font-bold text-primary-950 dark:text-gray-100">
            {isEdit ? t('studentForm.editTitle') : t('studentForm.createTitle')}
          </h2>
          <Link to="/students" className="text-sm text-primary-400 dark:text-gray-500 hover:text-primary-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.backToList')}
          </Link>
        </Flex>

        {Object.keys(errors).length > 0 && (
          <div className="mb-6 p-4 bg-danger-50 border border-danger-200 text-danger-700 dark:bg-danger-950/30 dark:border-danger-900/50 dark:text-danger-300 rounded-xl" role="alert">
            <p className="font-medium mb-2">{t('studentForm.validationErrors')}</p>
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
            <Link to="/students">
              <Button variant="secondary" type="button">
                {t('common.cancel')}
              </Button>
            </Link>
            <Button
              type="submit"
              variant={isEdit ? 'primary' : 'success'}
              size="lg"
              disabled={isSubmitting || loading}
              loading={isSubmitting || loading}
              leftIcon={isSubmitting || loading ? undefined : (isEdit ? 'save' : 'plus')}
            >
              {isSubmitting || loading
                ? t('common.saving')
                : isEdit
                ? t('common.saveChanges')
                : t('common.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}