/**
 * Models Index
 * Central export point for all database models
 */

// Base model (for extending if needed)
const BaseModel = require('./BaseModel');

// Core models
const ApartmentType = require('./ApartmentType');
const UserRole = require('./UserRole');
const Country = require('./Country');
const City = require('./City');
const District = require('./District');
const User = require('./User');
const Property = require('./Property');
const UserPreference = require('./UserPreference');
const ViewingTimeSlot = require('./ViewingTimeSlot');
const ViewingAppointment = require('./ViewingAppointment');

module.exports = {
  // Base
  BaseModel,
  
  // Reference data
  ApartmentType,
  UserRole,
  Country,
  City,
  District,
  
  // Core entities
  User,
  Property,
  UserPreference,
  
  // Viewing system
  ViewingTimeSlot,
  ViewingAppointment
}; 