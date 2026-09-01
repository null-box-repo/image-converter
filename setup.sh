#!/bin/sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}[1/6] Updating packages...${NC}"
apk update && echo -e "${GREEN}[1/6] Update complete${NC}"

echo -e "${BLUE}[2/6] Upgrading packages...${NC}"
apk upgrade && echo -e "${GREEN}[2/6] Upgrade complete${NC}"

echo -e "${BLUE}[3/6] Checking nodejs...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}[3/6] nodejs is already installed${NC}"
else
    echo -e "${YELLOW}[3/6] nodejs not found${NC}"
    echo -e "${BLUE}[3/6] Installing nodejs...${NC}"
    apk add nodejs && echo -e "${GREEN}[3/6] nodejs installed successfully${NC}"
fi

echo -e "${BLUE}[4/6] Checking npm...${NC}"
if command -v npm &> /dev/null; then
    echo -e "${GREEN}[4/6] npm is already installed${NC}"
else
    echo -e "${YELLOW}[4/6] npm not found${NC}"
    echo -e "${BLUE}[4/6] Installing npm...${NC}"
    apk add npm && echo -e "${GREEN}[4/6] npm installed successfully${NC}"
fi

echo -e "${BLUE}[5/6] Checking ImageMagick...${NC}"
if command -v magick &> /dev/null; then
    echo -e "${GREEN}[5/6] ImageMagick is already installed${NC}"
else
    echo -e "${YELLOW}[5/6] ImageMagick not found${NC}"
    echo -e "${BLUE}[5/6] Installing ImageMagick...${NC}"
    apk add imagemagick && echo -e "${GREEN}[5/6] ImageMagick installed successfully${NC}"
fi

echo -e "${BLUE}[6/6] Checking SVG support for ImageMagick...${NC}"
if magick -list format 2>/dev/null | grep -q "SVG.*rw+"; then
    echo -e "${GREEN}[6/6] SVG support is already available${NC}"
else
    echo -e "${YELLOW}[6/6] SVG support not found${NC}"
    echo -e "${BLUE}[6/6] Installing SVG support...${NC}"
    apk add imagemagick-svg && echo -e "${GREEN}[6/6] SVG support installed successfully${NC}"
fi

echo -e "${GREEN}All done.${NC}"