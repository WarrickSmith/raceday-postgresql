#!/bin/bash

# Appwrite Function Deployment Script
# This script provides programmatic deployment of the daily-race-importer function

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
FUNCTION_ID="daily-race-importer"
BUILD_DIR="dist"

# Check if required environment variables are set
check_environment() {
    print_status "Checking environment variables..."
    
    if [ -z "$APPWRITE_ENDPOINT" ]; then
        print_error "APPWRITE_ENDPOINT environment variable is not set"
        exit 1
    fi
    
    if [ -z "$APPWRITE_PROJECT_ID" ]; then
        print_error "APPWRITE_PROJECT_ID environment variable is not set"
        exit 1
    fi
    
    if [ -z "$APPWRITE_API_KEY" ]; then
        print_error "APPWRITE_API_KEY environment variable is not set"
        exit 1
    fi
    
    print_success "Environment variables validated"
}

# Check if Appwrite CLI is installed
check_cli() {
    print_status "Checking Appwrite CLI installation..."
    
    if ! command -v appwrite &> /dev/null; then
        print_error "Appwrite CLI is not installed"
        print_status "Installing Appwrite CLI globally..."
        npm install -g appwrite-cli
        print_success "Appwrite CLI installed"
    else
        print_success "Appwrite CLI is available"
    fi
}

# Configure Appwrite CLI
configure_cli() {
    print_status "Configuring Appwrite CLI..."
    
    appwrite client \
        --endpoint "$APPWRITE_ENDPOINT" \
        --project-id "$APPWRITE_PROJECT_ID" \
        --key "$APPWRITE_API_KEY"
    
    print_success "Appwrite CLI configured"
}

# Build the function
build_function() {
    print_status "Building TypeScript function..."
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Make sure you're in the function directory."
        exit 1
    fi
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm install
    fi
    
    # Build TypeScript
    npm run build
    
    if [ ! -d "$BUILD_DIR" ]; then
        print_error "Build failed - $BUILD_DIR directory not found"
        exit 1
    fi
    
    print_success "Function built successfully"
}

# Deploy the function
deploy_function() {
    print_status "Deploying function: $FUNCTION_ID"
    
    # Interactive deployment with validation
    if [ "$1" = "--dry-run" ]; then
        print_status "Running deployment validation check..."
        print_status "Checking current functions..."
        appwrite functions list
        print_status "Checking function configuration..."
        if [ -f "appwrite.json" ]; then
            print_success "appwrite.json configuration file found"
        else
            print_warning "appwrite.json configuration file not found"
        fi
        print_success "Deployment validation completed"
    else
        print_status "Deploying functions to Appwrite (interactive)..."
        appwrite push functions
        print_success "Deployment completed successfully!"
    fi
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run     Check deployment without actually deploying"
    echo "  --help        Show this help message"
    echo ""
    echo "Environment variables required:"
    echo "  APPWRITE_ENDPOINT     - Your Appwrite endpoint URL"
    echo "  APPWRITE_PROJECT_ID   - Your Appwrite project ID"
    echo "  APPWRITE_API_KEY      - Your Appwrite API key"
    echo ""
    echo "Examples:"
    echo "  $0                    # Deploy the function"
    echo "  $0 --dry-run          # Check deployment without deploying"
}

# Main deployment process
main() {
    print_status "Starting Appwrite function deployment process..."
    echo "===========================================" 
    
    # Handle command line arguments
    case "$1" in
        --help)
            usage
            exit 0
            ;;
        --dry-run)
            DRY_RUN="--dry-run"
            ;;
        "")
            DRY_RUN=""
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
    
    # Execute deployment steps
    check_environment
    check_cli
    configure_cli
    build_function
    deploy_function "$DRY_RUN"
    
    echo "==========================================="
    print_success "Deployment process completed!"
    
    if [ -z "$DRY_RUN" ]; then
        print_status "Your function is now available at:"
        print_status "https://cloud.appwrite.io/console/project-$APPWRITE_PROJECT_ID/functions/function-$FUNCTION_ID"
    fi
}

# Run main function with all arguments
main "$@"