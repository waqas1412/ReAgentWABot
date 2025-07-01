# Database Layer Documentation

## Overview

This document describes the comprehensive database layer implementation for the ReAgentBot WhatsApp application using Supabase. The database layer follows clean architecture principles with clear separation of concerns between models, services, and controllers.

## Architecture

### Layer Structure

```
Database Layer Architecture:
┌─────────────────────────────────────┐
│             Controllers             │
│    (Handle HTTP requests/responses) │
├─────────────────────────────────────┤
│             Services                │
│     (Business logic & operations)   │
├─────────────────────────────────────┤
│              Models                 │
│    (Data access & relationships)    │
├─────────────────────────────────────┤
│           Supabase Client           │
│      (Database connection)          │
└─────────────────────────────────────┘
```

### Key Principles

- **Separation of Concerns**: Models handle data access, services handle business logic, controllers handle HTTP
- **Lightweight Models**: Models only define schema and relationships, no business logic
- **Reusable Services**: Generic and decoupled service methods
- **Scalable Architecture**: Easy to extend and maintain

## Database Schema

### Core Tables

#### Users
- **Purpose**: Store user information (renters, agents, owners)
- **Key Fields**: `phone_number` (unique), `name`, `role_id`
- **Relationships**: References `user_roles`

#### Properties
- **Purpose**: Store property listings
- **Key Fields**: `address`, `price`, `bedrooms`, `bathrooms`, `status`
- **Relationships**: References `users` (owner, agent), `districts`, `apartment_types`

#### User Preferences
- **Purpose**: Store user search preferences
- **Key Fields**: Budget ranges, bedroom/bathroom requirements, location preferences
- **Relationships**: References `users`

#### Viewing Appointments
- **Purpose**: Manage property viewing appointments
- **Key Fields**: `appointment_date`, `user_id`, `viewing_time_slot_id`
- **Relationships**: References `users`, `viewing_time_slots`

### Reference Tables

- `user_roles`: System roles (renter, agent, owner)
- `apartment_types`: Property types (studio, 1BR, 2BR, etc.)
- `countries`: Country information
- `cities`: City information with country reference
- `districts`: District/neighborhood information
- `viewing_time_slots`: Available time slots for viewings

## Models

### BaseModel

The `BaseModel` class provides common database operations:

```javascript
// Common operations available to all models
findById(id)           // Find record by ID
findOne(filters)       // Find single record with filters
findAll(filters, options) // Find multiple records
create(data)           // Create new record
updateById(id, data)   // Update record by ID
deleteById(id)         // Delete record by ID
count(filters)         // Count records
exists(filters)        // Check if record exists
```

### Model Usage Examples

```javascript
const { User, Property, UserPreference } = require('./src/models');

// Find user by phone number
const user = await User.findByPhoneNumber('+1234567890');

// Search properties with filters
const properties = await Property.searchProperties({
  minPrice: 1000,
  maxPrice: 2000,
  bedrooms: 2,
  status: 'active'
});

// Get user preferences
const preferences = await UserPreference.getByUserId(userId);
```

## Services

### DatabaseService

The main service class providing high-level business operations:

#### User Management

```javascript
// Get or create user from WhatsApp
const user = await databaseService.getOrCreateUserFromWhatsApp(phoneNumber, name);

// Update user profile
await databaseService.updateUserProfile(phoneNumber, { name: 'John Doe' });
```

#### Property Management

```javascript
// Search properties
const properties = await databaseService.searchProperties({
  minPrice: 1000,
  maxPrice: 3000,
  bedrooms: 2
});

// Get properties for specific user (based on preferences)
const userProperties = await databaseService.getPropertiesForUser(userId);

// Create new property
const property = await databaseService.createProperty({
  owner_id: userId,
  address: '123 Main St',
  price: 1500,
  bedrooms: 2,
  bathrooms: 1
});
```

#### User Preferences

```javascript
// Set user preferences
await databaseService.setUserPreferences(phoneNumber, {
  budget_min: 1000,
  budget_max: 2500,
  bedrooms_min: 1,
  bedrooms_max: 3,
  preferred_location: 'Downtown'
});

// Get user preferences
const preferences = await databaseService.getUserPreferences(phoneNumber);
```

#### Viewing Appointments

```javascript
// Book viewing appointment
const appointment = await databaseService.bookViewingAppointment(
  phoneNumber, 
  timeSlotId, 
  '2024-01-15'
);

// Get user appointments
const appointments = await databaseService.getUserAppointments(phoneNumber);

// Cancel appointment
await databaseService.cancelAppointment(phoneNumber, appointmentId);
```

## WhatsApp Integration

### Enhanced Bot Capabilities

The WhatsApp controller now provides intelligent responses based on database data:

#### Property Search Commands
- `"search properties"` - Find properties based on user preferences
- `"budget $1000-2000"` - Search by price range
- `"properties in downtown"` - Search by location

#### Appointment Commands
- `"schedule viewing"` - Show available viewing slots
- `"my appointments"` - Display user's appointments
- `"cancel appointment"` - Cancel existing appointments

#### Profile Commands
- `"profile"` - Show user profile information
- `"preferences"` - Display preference options
- `"help"` - Context-aware help based on user role

### Message Processing Flow

```
Incoming WhatsApp Message
         ↓
Extract user info (phone, name)
         ↓
Get/Create user in database
         ↓
Analyze message content
         ↓
Execute appropriate database operations
         ↓
Format response with property data
         ↓
Send intelligent response via Twilio
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Database Configuration (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### Database Connection

The database connection is automatically initialized when the app starts:

```javascript
// Automatic initialization on app startup
✅ Database connection successful
Initializing reference data...
✅ User roles initialized
✅ Viewing time slots initialized
✅ Apartment types initialized
✅ Reference data initialization complete
```

## API Enhancements

### Health Check

The health endpoint now includes database status:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123.45,
  "version": "1.0.0",
  "database": "connected"
}
```

### Property Formatting

Properties are automatically formatted for WhatsApp display:

```
🏠 *123 Main Street*
💰 Price: $1,500
🛏️ 2 bed, 1 bath
📐 Area: 85 sqm
📊 Price/sqm: $17.65
📍 Downtown
🏢 Type: 2 Bedroom
✨ Features: Furnished, Elevator, AC
📝 Beautiful apartment in prime location
🔗 View Details: https://example.com/property/123
```

## Error Handling

### Database Errors

- Connection failures are logged but don't crash the application
- Individual operation errors are caught and user-friendly messages returned
- Database unavailability falls back to basic WhatsApp functionality

### Data Validation

- User preferences are validated before saving
- Property creation requires mandatory fields
- Appointment booking checks slot availability

## Development Guidelines

### Adding New Models

1. Extend `BaseModel` class
2. Define schema in static `schema` getter
3. Add model-specific methods
4. Export from `src/models/index.js`

### Adding New Services

1. Import required models
2. Implement business logic methods
3. Handle errors gracefully
4. Add to `DatabaseService` class

### Testing Database Operations

```javascript
// Test database connection
const { testConnection } = require('./src/config/database');
const isConnected = await testConnection();

// Test model operations
const { User } = require('./src/models');
const user = await User.findByPhoneNumber('+1234567890');

// Test service operations
const databaseService = require('./src/services/databaseService');
const stats = await databaseService.getSystemStatistics();
```

## Performance Considerations

### Query Optimization

- Use appropriate indexes on frequently queried fields
- Limit results with pagination for large datasets
- Use joins efficiently for related data

### Caching Strategy

- Consider implementing Redis for frequently accessed data
- Cache user preferences and property search results
- Use Supabase built-in caching where appropriate

### Monitoring

- Monitor database connection health
- Track query performance
- Log slow operations for optimization

## Future Enhancements

### Planned Features

1. **Advanced Search**: Full-text search, geographic queries
2. **Real-time Notifications**: WebSocket integration for instant updates
3. **Analytics Dashboard**: Usage statistics and insights
4. **Bulk Operations**: Import/export functionality
5. **Audit Trail**: Track all data changes

### Scalability Improvements

1. **Connection Pooling**: Optimize database connections
2. **Read Replicas**: Separate read/write operations
3. **Data Partitioning**: Optimize large tables
4. **Microservices**: Split into specialized services

## Troubleshooting

### Common Issues

1. **Connection Timeout**: Check network and Supabase status
2. **Permission Errors**: Verify API keys and Row Level Security
3. **Schema Mismatches**: Ensure database schema matches models
4. **Memory Usage**: Monitor for connection leaks

### Debug Commands

```bash
# Test database connection
curl http://localhost:3000/health

# Check application logs
npm run logs

# Verify environment variables
echo $SUPABASE_URL
```

## Support

For database-related issues:

1. Check application logs for error details
2. Verify Supabase dashboard for service status
3. Test connection with health endpoint
4. Review environment variable configuration

---

**Note**: This implementation provides a solid foundation for a real estate WhatsApp bot with full database integration. The architecture is designed to be scalable, maintainable, and easy to extend with additional features. 