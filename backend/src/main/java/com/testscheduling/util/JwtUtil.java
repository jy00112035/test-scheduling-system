package com.testscheduling.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private Long expiration;

    private SecretKey getSigningKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String username, List<String> roles) {
        Map<String, Object> claims = new HashMap<>();
        String primaryRole = (roles != null && !roles.isEmpty()) ? roles.get(0) : null;
        claims.put("role", primaryRole);
        claims.put("roles", roles);
        return createToken(claims, username);
    }

    private String createToken(Map<String, Object> claims, String subject) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
            .claims(claims)
            .subject(subject)
            .issuedAt(now)
            .expiration(expiryDate)
            .signWith(getSigningKey())
            .compact();
    }

    public Claims getClaimsFromToken(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    public String getUsernameFromToken(String token) {
        return getClaimsFromToken(token).getSubject();
    }

    public String getRoleFromToken(String token) {
        return (String) getClaimsFromToken(token).get("role");
    }

    public List<String> getRolesFromToken(String token) {
        Object rolesObj = getClaimsFromToken(token).get("roles");
        if (rolesObj instanceof List<?> list) {
            return list.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .collect(Collectors.toList());
        }
        String singleRole = getRoleFromToken(token);
        return singleRole != null ? List.of(singleRole) : List.of();
    }

    public boolean isTokenExpired(String token) {
        try {
            return getClaimsFromToken(token).getExpiration().before(new Date());
        } catch (Exception e) {
            return true;
        }
    }

    public boolean validateToken(String token, String username) {
        return (getUsernameFromToken(token).equals(username) && !isTokenExpired(token));
    }
}
