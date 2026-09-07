'use strict';

class StudentPredictionDataError extends Error {
  constructor(options = {}) {
    super('Student record does not contain sufficient valid prediction data.', options);
    this.name = 'StudentPredictionDataError';
    this.code = 'INSUFFICIENT_STUDENT_DATA';
  }
}

class MlDependencyError extends Error {
  constructor(message = 'ML dependency unavailable.', options = {}) {
    super(message, options);
    this.name = 'MlDependencyError';
    this.code = 'ML_SERVICE_UNAVAILABLE';
  }
}

module.exports = {
  MlDependencyError,
  StudentPredictionDataError,
};
